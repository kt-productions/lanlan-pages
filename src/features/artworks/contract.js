export const ARTWORK_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "video/mp4": "mp4",
};
export const ARTWORK_CATEGORIES = { animation: "角色動畫", chibi: "小動圖", stickers: "貼圖" };
export const ARTWORK_MAX_BYTES = 10 * 1024 * 1024;
export const ARTWORK_STATES = {
  draft: "草稿",
  queued: "等待處理",
  processing: "處理中",
  stored: "作品已保存",
  promoted: "等待部署",
  published: "已上線",
  failed: "處理失敗",
  cancelled: "已放棄",
  superseded: "已由新版本接續",
};

export function artworkAssert(value, message) {
  if (!value) {
    const error = new Error(message);
    error.name = "ArtworkValidationError";
    throw error;
  }
}
export function artworkOperation(value) {
  artworkAssert(
    typeof value === "string" &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value),
    "作品工作識別碼不正確。",
  );
  return value;
}
export function artworkFields(input) {
  artworkAssert(input && Object.hasOwn(ARTWORK_CATEGORIES, input.category), "請選擇作品分類。");
  const output = { category: input.category };
  for (const [key, max, required] of [
    ["title", 100, true],
    ["alt", 300, false],
    ["description", 2000, false],
  ]) {
    const value = input[key] ?? "";
    artworkAssert(
      typeof value === "string" &&
        value.length <= max &&
        !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value),
      "作品文字格式不正確或過長。",
    );
    artworkAssert(!required || value.trim(), "請填寫作品名稱。");
    output[key] = value.trim();
  }
  return output;
}
export function artworkFile(input) {
  artworkAssert(input && Object.hasOwn(ARTWORK_TYPES, input.type), "只接受 PNG、JPG、GIF、MP4。");
  artworkAssert(
    Number.isInteger(input.size) && input.size > 0 && input.size <= ARTWORK_MAX_BYTES,
    "作品每檔上限為 10 MiB。",
  );
  artworkAssert(
    typeof input.name === "string" &&
      input.name.length > 0 &&
      input.name.length <= 150 &&
      !/[\x00-\x1f\x7f\\/]/.test(input.name),
    "檔名不正確。",
  );
  artworkAssert(/^[a-f0-9]{64}$/.test(input.sha256), "作品雜湊不正確。");
  return { name: input.name, type: input.type, size: input.size, sha256: input.sha256 };
}
export function artworkMime(bytes) {
  const head = Array.from(bytes.slice(0, 32), (value) => value & 255);
  const text = String.fromCharCode(...head);
  if (head.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10") return "image/png";
  if (head[0] === 255 && head[1] === 216 && head[2] === 255) return "image/jpeg";
  if (/^GIF8[79]a/.test(text)) return "image/gif";
  if (text.slice(4, 8) === "ftyp" && /isom|iso2|mp41|mp42|avc1|M4V |MSNV/.test(text.slice(8)))
    return "video/mp4";
  return "";
}

/** 顯示順序獨立於作品 ID；尚未指定的作品沿用編號排序，新作品仍會排在前面。 */
export function compareArtworkOrder(a, b) {
  const order = (work) => work.sortOrder ?? Number(work.id.split("-").at(-1));
  return order(b) - order(a);
}

/** 舊作品只用覆寫清單調整公開內容，原始來源及表單款式不跟著變動。 */
export function mergeArtworks(base, manifest, includeDeleted = false) {
  artworkAssert(manifest?.version === 1 && Array.isArray(manifest.items), "作品清單版本不相容。");
  const map = new Map(base.map((work) => [work.id, { ...work, revision: 0 }]));
  const seen = new Set();
  for (const item of manifest.items) {
    artworkAssert(
      /^(animation|chibi|stickers)-[0-9]+$/.test(item.id) && !seen.has(item.id),
      "作品編號重複或不正確。",
    );
    seen.add(item.id);
    artworkAssert(Number.isInteger(item.revision) && item.revision > 0, "作品版本不正確。");
    artworkAssert(
      item.sortOrder === undefined || (Number.isSafeInteger(item.sortOrder) && item.sortOrder > 0),
      "作品顯示順序必須是正整數。",
    );
    const previous = map.get(item.id);
    map.set(item.id, { ...previous, ...item, ...item.media });
  }
  return [...map.values()]
    .filter((work) => includeDeleted || !work.deleted)
    .sort(compareArtworkOrder);
}
