import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { root, resolveWithin } from "./paths.mjs";

const baseProfile = {
  codec: "libx264",
  preset: "slow",
  pixelFormat: "yuv420p",
  audio: "copy",
  fastStart: true,
};
export const videoProfiles = {
  preview: { ...baseProfile, crf: 26, maxDimension: 640 },
  display: { ...baseProfile, crf: 23, maxDimension: 1280 },
};

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// 解析最外層 MP4 box，避免把影片內容恰好出現的字串誤認成索引。
export function hasFastStart(bytes) {
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    let size = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (size === 1) {
      if (offset + 16 > bytes.length) return false;
      size = Number(bytes.readBigUInt64BE(offset + 8));
      if (size < 16) return false;
    }
    if (size === 0) size = bytes.length - offset;
    if (size < 8 || offset + size > bytes.length) return false;
    if (type === "moov") return true;
    if (type === "mdat") return false;
    offset += size;
  }
  return false;
}

export async function readVideoAssets(works) {
  const manifest = JSON.parse(await readFile(path.join(root, "content/video-assets.json"), "utf8"));
  assert.equal(manifest.version, 1, "未知的影片衍生素材版本");
  assert.deepEqual(manifest.profiles, videoProfiles, "請重新執行 npm run optimize:videos");
  assert.equal(manifest.videos.length, works.length, "影片衍生素材數量不符");
  const assets = new Map();
  for (const work of works) {
    const asset = manifest.videos.find((item) => item.id === work.id);
    assert.ok(asset && !assets.has(work.id), `缺少影片衍生素材：${work.id}`);
    assert.equal(asset.source, work.src, `${work.id} 來源路徑不符`);
    assert.equal(asset.sourceSha256, work.sha256, `${work.id} 來源版本不符`);
    const original = await readFile(resolveWithin(path.join(root, "public"), work.src));
    assert.equal(original.length, work.bytes, `${work.id} 原始大小不符`);
    assert.equal(sha256(original), work.sha256, `${work.id} 原始雜湊不符`);
    for (const [kind, profile] of Object.entries(videoProfiles)) {
      const variant = asset[kind];
      assert.ok(variant, `${work.id} 缺少 ${kind} 版本`);
      assert.match(
        variant.src,
        new RegExp(`^assets/videos/optimized/${work.id}-[a-f0-9]{12}\\.mp4$`),
      );
      const bytes = await readFile(resolveWithin(path.join(root, "public"), variant.src));
      assert.equal(bytes.length, variant.bytes, `${work.id} ${kind} 大小不符`);
      assert.equal(sha256(bytes), variant.sha256, `${work.id} ${kind} 雜湊不符`);
      assert.ok(
        variant.src.endsWith(`-${variant.sha256.slice(0, 12)}.mp4`),
        "影片網址必須包含內容版本",
      );
      assert.ok(
        variant.bytes < work.bytes && hasFastStart(bytes),
        `${work.id} ${kind} 未縮小或缺少起播索引`,
      );
      assert.ok(
        variant.width > 0 &&
          variant.height > 0 &&
          Math.max(variant.width, variant.height) <= profile.maxDimension,
        `${work.id} ${kind} 尺寸有誤`,
      );
      assert.ok(
        Math.abs(variant.width / variant.height - work.width / work.height) < 0.01,
        `${work.id} ${kind} 比例有誤`,
      );
      assert.ok(Math.abs(variant.duration - work.duration) < 0.1, `${work.id} ${kind} 片長有誤`);
    }
    assert.ok(asset.preview.bytes < asset.display.bytes, `${work.id} 預覽版應更小`);
    assets.set(work.id, asset);
  }
  return assets;
}

/** 首頁專用 GIF 不加入作品清單；來源、影片與縮圖仍須可追溯並通過建置核對。 */
export async function readHeroVideo() {
  const hero = JSON.parse(await readFile(path.join(root, "content/hero-video.json"), "utf8"));
  assert.equal(hero.version, 1, "未知的首頁影片清單版本");
  for (const key of ["source", "video", "poster"]) {
    const asset = hero[key];
    const bytes = await readFile(resolveWithin(path.join(root, "public"), asset.src));
    assert.equal(bytes.length, asset.bytes, `首頁 ${key} 大小不符`);
    assert.equal(sha256(bytes), asset.sha256, `首頁 ${key} 雜湊不符`);
    assert.ok(asset.width > 0 && asset.height > 0, `首頁 ${key} 尺寸不正確`);
    assert.ok(
      Math.abs(asset.width / asset.height - hero.source.width / hero.source.height) < 0.01,
      `首頁 ${key} 比例不正確`,
    );
    if (key === "source") continue;
    assert.ok(asset.src.includes(`-${asset.sha256.slice(0, 12)}.`), "首頁素材網址須包含內容版本");
    assert.ok(asset.bytes < hero.source.bytes, `首頁 ${key} 未縮小`);
    assert.ok(Math.max(asset.width, asset.height) <= 960, `首頁 ${key} 尺寸過大`);
    if (key === "video") assert.ok(hasFastStart(bytes), "首頁影片缺少起播索引");
  }
  assert.equal(hero.video.frames, hero.source.frames, "首頁影片影格數改變");
  assert.equal(hero.video.duration, hero.source.duration, "首頁影片片長改變");
  return hero;
}
