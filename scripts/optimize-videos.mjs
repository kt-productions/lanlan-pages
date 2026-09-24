import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, mkdtemp, rm, copyFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { root, resolveWithin } from "./lib/paths.mjs";
import { readContent } from "./lib/content.mjs";
import { videoProfiles, sha256, hasFastStart } from "./lib/video-assets.mjs";

const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
function run(tool, args) {
  return execFileSync(tool, args, {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
function probe(file) {
  return JSON.parse(run(ffprobe, ["-v", "error", "-show_streams", "-of", "json", file])).streams;
}
const encoder = run(ffmpeg, ["-version"]).split(/\r?\n/)[0];
run(ffprobe, ["-version"]);
const works = await readContent("works.json");
const manifestPath = path.join(root, "content/video-assets.json");
let previous;
try {
  previous = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const destination = path.join(root, "public/assets/videos/optimized");
await mkdir(destination, { recursive: true });
const temporary = await mkdtemp(path.join(tmpdir(), "lanlan-video-"));
const videos = [];
try {
  for (const work of works) {
    assert.match(work.id, /^(animation|chibi)-\d+$/);
    const source = resolveWithin(path.join(root, "public"), work.src);
    const original = await readFile(source);
    assert.equal(original.length, work.bytes, `${work.id} 原始大小不符`);
    assert.equal(sha256(original), work.sha256, `${work.id} 原始雜湊不符`);
    const saved = previous?.videos.find((item) => item.id === work.id);
    const asset = { id: work.id, source: work.src, sourceSha256: work.sha256 };
    const inputStreams = probe(source);
    const inputVideo = inputStreams.find((stream) => stream.codec_type === "video");
    for (const [kind, videoProfile] of Object.entries(videoProfiles)) {
      if (
        saved?.sourceSha256 === work.sha256 &&
        saved[kind] &&
        JSON.stringify(previous.profiles?.[kind]) === JSON.stringify(videoProfile)
      ) {
        try {
          const bytes = await readFile(resolveWithin(path.join(root, "public"), saved[kind].src));
          if (
            sha256(bytes) === saved[kind].sha256 &&
            bytes.length === saved[kind].bytes &&
            hasFastStart(bytes)
          ) {
            asset[kind] = saved[kind];
            continue;
          }
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      const target = path.join(temporary, `${work.id}-${kind}.mp4`);
      run(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-i",
        source,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-map_metadata",
        "-1",
        "-vf",
        `scale=w='min(iw,${videoProfile.maxDimension})':h='min(ih,${videoProfile.maxDimension})':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`,
        "-c:v",
        videoProfile.codec,
        "-crf",
        String(videoProfile.crf),
        "-preset",
        videoProfile.preset,
        "-pix_fmt",
        videoProfile.pixelFormat,
        "-threads",
        "4",
        "-c:a",
        videoProfile.audio,
        "-movflags",
        "+faststart",
        target,
      ]);
      const streams = probe(target);
      const video = streams.find((stream) => stream.codec_type === "video");
      const bytes = await readFile(target);
      const hash = sha256(bytes);
      assert.ok(bytes.length < original.length, `${work.id} 壓縮後未縮小，請檢查編碼參數`);
      assert.ok(hasFastStart(bytes), `${work.id} 缺少起播索引`);
      assert.equal(video.codec_name, "h264");
      assert.equal(video.nb_frames, inputVideo.nb_frames, `${work.id} 影格數改變`);
      assert.equal(video.avg_frame_rate, inputVideo.avg_frame_rate, `${work.id} 影格率改變`);
      assert.ok(Math.abs(Number(video.duration) - work.duration) < 0.1, `${work.id} 片長改變`);
      assert.equal(
        streams.filter((s) => s.codec_type === "audio").length,
        inputStreams.filter((s) => s.codec_type === "audio").length,
      );
      const src = `assets/videos/optimized/${work.id}-${hash.slice(0, 12)}.mp4`;
      await copyFile(target, resolveWithin(path.join(root, "public"), src));
      asset[kind] = {
        src,
        bytes: bytes.length,
        sha256: hash,
        width: video.width,
        height: video.height,
        duration: Number(video.duration),
        frameRate: video.avg_frame_rate,
        frames: Number(video.nb_frames),
      };
      console.log(`${work.id} ${kind}: ${original.length} → ${bytes.length} bytes`);
    }
    videos.push(asset);
  }
  // 整批完成才替換清單，編碼中止時保留上一次可用的版本。
  await writeFile(
    manifestPath + ".tmp",
    JSON.stringify({ version: 1, encoder, profiles: videoProfiles, videos }, null, 2) + "\n",
  );
  await rename(manifestPath + ".tmp", manifestPath);
  for (const kind of Object.keys(videoProfiles))
    console.log(
      `已核對 ${videos.length} 支影片，${kind} 合計 ${videos.reduce((total, item) => total + item[kind].bytes, 0)} bytes；原始檔保留。`,
    );
} finally {
  // 僅清理由本次 mkdtemp 建立的編碼暫存，不清理作品來源或舊版衍生素材。
  await rm(temporary, { recursive: true, force: true });
}
