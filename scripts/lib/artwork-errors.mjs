// 公開日誌只輸出本機定義的說明；不可直接序列化後端例外或媒體工具 stderr。
const descriptions = {
  API_RESULT: "作品服務未回傳可確認的結果，請稍後從後台重試。",
  API_REDIRECT: "作品服務回應的轉址不正確。",
  DOWNLOAD_VERSION: "作品下載版本已變更。",
  DOWNLOAD_CHUNK: "作品下載區塊格式或大小不符。",
  DOWNLOAD_HASH: "作品下載雜湊不符。",
  DRIVE_DOWNLOAD: "作品區塊下載失敗。",
  DRIVE_SIZE: "作品區塊大小不符。",
  DRIVE_FULL_SIZE: "作品完整下載大小不符。",
  DRIVE_SCOPE: "作品暫存範圍或內容不符。",
  LEASE_EXPIRED: "工作租約已失效，請由新的工作接續。",
  MEDIA_INTEGRITY: "作品檔案完整性或格式不符。",
  MEDIA_DIMENSIONS: "圖片尺寸過大或無法解碼。",
  MEDIA_FRAMES: "作品影格數超出限制。",
  MEDIA_DURATION: "GIF 上限 15 秒，MP4 上限 120 秒。",
  MEDIA_OUTPUT: "衍生作品檔案過大。",
  PROCESS_TIMEOUT: "處理逾時。",
  PROCESS_FAILED: "子程序執行失敗。",
  PROCESS_MISSING: "找不到所需的執行工具。",
  UNKNOWN: "未分類的錯誤；請依最後完成的階段追查。",
};

export class ArtworkWorkerError extends Error {
  constructor(code) {
    const safeCode = Object.hasOwn(descriptions, code) ? code : "UNKNOWN";
    super(descriptions[safeCode]);
    this.code = safeCode;
  }
}

export function artworkFailureSummary(error) {
  const code = error instanceof ArtworkWorkerError && Object.hasOwn(descriptions, error.code)
    ? error.code
    : Object.keys(descriptions).find((key) => descriptions[key] === error?.message) || "UNKNOWN";
  return `[${code}] ${descriptions[code]}`;
}
