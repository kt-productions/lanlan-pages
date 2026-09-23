import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { root, resolveWithin } from "./lib/paths.mjs";
import { readContent } from "./lib/content.mjs";
import { hasFastStart, sha256 } from "./lib/video-assets.mjs";

const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
const run = (tool, args) => execFileSync(tool, args, {
  encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
});
const probe = (file) => JSON.parse(run(ffprobe, [
  "-v", "error", "-show_streams", "-show_frames", "-of", "json", file,
]));
const hero = await readContent("hero-video.json");
const source = resolveWithin(path.join(root, "public"), hero.source.src);
const original = await readFile(source);
assert.equal(original.length, hero.source.bytes, "首頁 GIF 原始大小不符");
assert.equal(sha256(original), hero.source.sha256, "首頁 GIF 原始雜湊不符");
const input = probe(source);
const temporary = await mkdtemp(path.join(tmpdir(), "lanlan-hero-"));
const output = path.join(temporary, "hero.mp4");
const poster = path.join(temporary, "hero.jpg");
const profile = {
  codec: "libx264", crf: 23, preset: "slow", pixelFormat: "yuv420p",
  maxDimension: 960, frameTiming: "passthrough", fastStart: true,
  posterCodec: "mjpeg", posterQuality: 3,
};
const scale = `scale=w='min(iw,${profile.maxDimension})':h='min(ih,${profile.maxDimension})':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`;
// GIF 各格為 80 或 90 ms；保留時間戳，避免轉固定影格率改變撩髮節奏。
run(ffmpeg, [
  "-hide_banner", "-loglevel", "error", "-nostdin", "-n", "-i", source,
  "-map", "0:v:0", "-an", "-map_metadata", "-1", "-vf", scale,
  "-c:v", profile.codec, "-crf", String(profile.crf), "-preset", profile.preset,
  "-pix_fmt", profile.pixelFormat, "-fps_mode", "passthrough", "-enc_time_base", "1/100",
  "-video_track_timescale", "1000", "-movflags", "+faststart", output,
]);
run(ffmpeg, [
  "-hide_banner", "-loglevel", "error", "-nostdin", "-n", "-i", source,
  "-frames:v", "1", "-vf", scale, "-c:v", profile.posterCodec, "-q:v", String(profile.posterQuality), poster,
]);
const result = probe(output);
const stream = result.streams.find(item => item.codec_type === "video");
const bytes = await readFile(output);
assert.equal(stream.codec_name, "h264");
assert.equal(Number(stream.nb_frames), hero.source.frames, "影格數改變");
assert.equal(Number(stream.duration), hero.source.duration, "片長改變");
assert.deepEqual(result.frames.map(frame => Number(frame.pts_time)),
  input.frames.map(frame => Number(frame.pts_time)), "影格時間戳改變");
assert.ok(bytes.length < original.length && hasFastStart(bytes), "壓縮或起播索引有誤");
const digest = sha256(bytes);
const posterBytes = await readFile(poster);
const posterDigest = sha256(posterBytes);
hero.encoder = run(ffmpeg, ["-version"]).split(/\r?\n/)[0];
hero.profile = profile;
hero.video = {
  src: `assets/videos/optimized/hero-main-${digest.slice(0, 12)}.mp4`,
  bytes: bytes.length, sha256: digest, width: stream.width, height: stream.height,
  duration: Number(stream.duration), frames: Number(stream.nb_frames),
};
hero.poster = {
  src: `assets/posters/hero-main-${posterDigest.slice(0, 12)}.jpg`,
  bytes: posterBytes.length, sha256: posterDigest,
  width: stream.width, height: stream.height,
};
for (const [file, asset] of [[output, hero.video], [poster, hero.poster]]) {
  const destination = resolveWithin(path.join(root, "public"), asset.src);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(file, destination);
}
const manifest = path.join(root, "content/hero-video.json");
await writeFile(manifest + ".tmp", JSON.stringify(hero, null, 2) + "\n");
await rename(manifest + ".tmp", manifest);
await Promise.all([unlink(output), unlink(poster)]);
await rmdir(temporary);
console.log(`首頁中央影片：${original.length} → ${bytes.length} bytes；縮圖 ${posterBytes.length} bytes，原始 GIF 保留。`);
