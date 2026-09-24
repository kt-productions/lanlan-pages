export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MAX_FILES = 5;
// 預留 GAS 單次對外請求的 multipart 編碼空間，讓五檔可一次作為相簿送出。
export const ATTACHMENT_MAX_TOTAL_BYTES = 45 * 1024 * 1024;
export const ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
];
export const API_MAX_REQUEST_CHARS = Math.ceil(ATTACHMENT_MAX_BYTES / 3) * 4 + 40000;

/** 前後端共用大小與類型限制；後端另核對檔案簽章，不相信瀏覽器 MIME。 */
export function attachmentFileError(file, imagesOnly = false) {
  if (!file || !Number.isInteger(file.size) || file.size < 1) return "請選擇有內容的檔案。";
  if (file.size > ATTACHMENT_MAX_BYTES) return "每個檔案最多 10 MB；較大檔案請改填參考素材連結。";
  if (imagesOnly && !ATTACHMENT_TYPES.includes(file.type))
    return "貼圖包請上傳 PNG、JPEG、GIF、WebP 或 AVIF 圖片。";
  return "";
}
