import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { artworkAssert, artworkFields, mergeArtworks } from "../../src/features/artworks/contract.js";
import { root, resolveWithin } from "./paths.mjs";

export const stickerWork = {
  id: "stickers-01", category: "stickers", title: "48 種小表情", type: "image",
  src: "assets/originals/stickers.png", poster: "assets/posters/stickers.webp",
  width: 5761, height: 4320, alt: "爛爛的 48 款貼圖示例，包含開心、疑惑、愛心、哭泣與日常表情。",
};
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export function managedPath(value) {
  artworkAssert(typeof value === "string" && /^assets\/artworks\/(animation|chibi|stickers)-[0-9]+\/[a-f0-9]{64}\/(original\.(png|jpg|gif|mp4)|poster\.png|display\.(png|gif|mp4)|preview\.mp4)$/.test(value), "作品資源路徑不正確。");
  return value;
}
export async function readArtworkCatalog(raw, videos, directory = root) {
  const manifestBytes = await readFile(path.join(directory, "content/artworks.json"));
  artworkAssert(manifestBytes.length < 900000, "作品清單超過後台可讀取的容量，停止發布。");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const base = [...raw.map(work => ({ ...work, previewSrc: videos.get(work.id).preview.src,
    playbackSrc: videos.get(work.id).display.src })), stickerWork];
  const works = mergeArtworks(base, manifest);
  for (const item of manifest.items) {
    if (item.deleted) continue;
    artworkFields(item);
    if (item.media) {
      const media = item.media;
      artworkAssert(["image", "video"].includes(media.type) && media.width > 0 && media.height > 0, "作品媒體資訊不完整。");
      artworkAssert(Array.isArray(media.assets) && media.assets.length >= 2, "作品缺少來源及衍生檔。");
      for (const asset of media.assets) {
        const bytes = await readFile(resolveWithin(path.join(directory, "public"), managedPath(asset.path)));
        artworkAssert(bytes.length === asset.bytes && sha256(bytes) === asset.sha256, "作品素材完整性檢查失敗。");
      }
      for (const key of ["src", "poster", "playbackSrc", ...(media.type === "video" ? ["previewSrc"] : [])]) {
        artworkAssert(media.assets.some(asset => asset.path === media[key]), "作品媒體引用不完整。");
      }
      artworkAssert(media.source?.path === media.src && media.assets.some(asset => asset.path === media.src && asset.sha256 === media.source.sha256 && asset.bytes === media.source.bytes), "作品原檔紀錄不完整。");
    } else artworkAssert(base.some(work => work.id === item.id), "新作品必須包含媒體。");
  }
  return { works, manifest, base };
}

export function applyArtworkJob(manifest, base, job, media) {
  const existing = manifest.items.find(item => item.operationId === job.operationId);
  if (existing) return manifest;
  const current = mergeArtworks(base, manifest, true).find(item => item.id === job.work.id);
  artworkAssert((current?.revision || 0) === job.expectedRevision, "作品已被其他工作更新，請重新讀取後編輯。");
  artworkAssert(!current?.deleted, "作品已下架。");
  artworkAssert(job.action === "delete" ? Boolean(current) : Boolean(current || media), "找不到作品媒體。");
  artworkAssert(!current || current.category === job.work.category, "既有作品不能更換編號分類。");
  const previous = manifest.items.find(item => item.id === job.work.id);
  const item = { id: job.work.id, ...artworkFields(job.work), revision: job.expectedRevision + 1,
    operationId: job.operationId, deleted: job.action === "delete" };
  if (!item.deleted && (media || previous?.media)) item.media = media || previous.media;
  return { version: 1, items: [...manifest.items.filter(entry => entry.id !== item.id), item] };
}
