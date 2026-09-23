import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { artworkAssert, artworkFile, artworkMime, ARTWORK_TYPES } from "../../src/features/artworks/contract.js";
import { sha256 } from "./artworks.mjs";

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, shell: false, ...options });
    let output = "";
    let errors = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("處理逾時。")); }, options.timeout || 300000);
    child.stdout?.on("data", bytes => { if (output.length < 2000000) output += bytes; });
    child.stderr?.on("data", bytes => { if (errors.length < 12000) errors += bytes; });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", code => { clearTimeout(timer); code === 0 ? resolve(output.trim()) : reject(new Error(`${command} 執行失敗（${code}）：${errors.slice(-2000)}`)); });
  });
}

/** 檢查實際解碼資訊後才轉檔，來源位元組永遠另存，不覆寫原檔。 */
export async function processArtwork(bytes, file, id, directory) {
  artworkFile(file);
  artworkAssert(bytes.length === file.size && sha256(bytes) === file.sha256 && artworkMime(bytes) === file.type, "作品檔案完整性或格式不符。");
  artworkAssert(/^(animation|chibi|stickers)-[0-9]+$/.test(id), "作品編號不正確。");
  const relative = `assets/artworks/${id}/${file.sha256}`;
  const target = path.join(directory, "public", relative);
  await mkdir(target, { recursive: true });
  const extension = ARTWORK_TYPES[file.type];
  const original = path.join(target, `original.${extension}`);
  await writeFile(original, bytes);
  const probeArgs = ["-v", "error", "-max_alloc", "134217728", "-protocol_whitelist", "file,pipe", "-show_streams", "-show_format", "-of", "json"];
  const probe = JSON.parse(await run(process.env.FFPROBE_PATH || "ffprobe", [...probeArgs, original], { timeout: 120000 }));
  const stream = probe.streams.find(item => item.codec_type === "video");
  artworkAssert(stream && stream.width > 0 && stream.height > 0 && stream.width <= 8192 && stream.height <= 8192 &&
    stream.width * stream.height <= 40000000, "圖片尺寸過大或無法解碼。");
  const duration = Number(stream.duration || probe.format.duration || 0);
  const counted = JSON.parse(await run(process.env.FFPROBE_PATH || "ffprobe", [...probeArgs, "-count_frames", original], { timeout: 120000 }));
  const frames = Number(counted.streams.find(item => item.codec_type === "video").nb_read_frames || stream.nb_frames || 1);
  const animated = file.type === "image/gif";
  const video = file.type === "video/mp4";
  artworkAssert(Number.isFinite(frames) && frames > 0 && frames <= (animated ? 450 : video ? 7200 : 1), "作品影格數超出限制。");
  artworkAssert(!(animated || video) || (duration > 0 && duration <= (animated ? 15 : 120)), "GIF 上限 15 秒，MP4 上限 120 秒。");
  const ffmpeg = async args => run(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-max_alloc", "134217728", "-threads", "2", "-filter_threads", "2", "-protocol_whitelist", "file,pipe", "-i", original, ...args]);
  const scale = size => `scale=w='min(${size},iw)':h='min(${size},ih)':force_original_aspect_ratio=decrease`;
  await ffmpeg(["-map", "0:v:0", "-frames:v", "1", "-vf", scale(640), "-map_metadata", "-1", path.join(target, "poster.png")]);
  const names = [`original.${extension}`, "poster.png"];
  if (video) {
    for (const [name, size] of [["preview.mp4", 640], ["display.mp4", 1280]]) {
      await ffmpeg(["-map", "0:v:0", "-an", "-vf", `${scale(size)},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
        "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p", "-threads", "2",
        "-map_metadata", "-1", "-movflags", "+faststart", path.join(target, name)]);
      names.push(name);
    }
  } else if (!animated) {
    await ffmpeg(["-map", "0:v:0", "-frames:v", "1", "-vf", scale(1280), "-map_metadata", "-1", path.join(target, "display.png")]);
    names.push("display.png");
  }
  const assets = await Promise.all(names.map(async name => {
    const data = await readFile(path.join(target, name));
    artworkAssert(data.length > 0 && data.length <= 40 * 1024 * 1024, "衍生作品檔案過大。");
    return { path: `${relative}/${name}`, bytes: data.length, sha256: sha256(data) };
  }));
  const source = assets[0];
  return { type: video ? "video" : "image", animated, width: stream.width, height: stream.height, duration,
    src: source.path, poster: `${relative}/poster.png`, playbackSrc: video ? `${relative}/display.mp4` : animated ? source.path : `${relative}/display.png`,
    ...(video ? { previewSrc: `${relative}/preview.mp4` } : {}), source, assets };
}
