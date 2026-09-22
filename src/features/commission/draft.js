import { estimateCommission } from "./pricing.js";

/** @param {FormData} data @returns {import("./pricing.js").Selection} */
export function selectionFromData(service, data) {
  return {
    service,
    stickerIds: data.getAll("stickerIds"),
    chibiPlan: data.get("chibiPlan"),
    characterCount: data.get("characterCount"),
    transition: data.get("transition"),
    commercial: data.get("commercial"),
    background: data.get("background"),
    rush: data.get("rush"),
    payment: data.get("payment"),
  };
}

// 僅在必填驗證通過後建立快照。隱藏欄位依類型明確輸出 null／空陣列，避免前次選擇滲入草稿。
// 下載仍是本機草稿；正式收件回執使用獨立契約，不能因下載成功改動未送件旗標。
/** @param {FormData} data @param {{name: string, size: number, type: string}|undefined} file */
export function createDraft(config, service, data, file, rulesReviewed) {
  const selection = selectionFromData(service, data);
  const ids = new Set(selection.stickerIds.map(Number));
  return {
    schemaVersion: config.version,
    mode: "local-preview",
    submitted: false,
    service,
    sourceForm: config.services[service].source,
    nickname: data.get("nickname").trim(),
    contact: {
      channel: data.get("contactChannel"),
      value: data.get("contact").trim(),
    },
    referenceUrl: (data.get("referenceUrl") || "").trim(),
    reference: file
      ? {
          name: file.name,
          size: file.size,
          type: file.type || "application/octet-stream",
          uploaded: false,
        }
      : null,
    stickerIds:
      service === "stickers"
        ? config.stickerOptions
            .filter((item) => ids.has(item.number))
            .map((item) => item.number)
        : [],
    chibiPlan: service === "chibi" ? data.get("chibiPlan") : null,
    characterCount:
      service !== "stickers" ? Number(data.get("characterCount")) : null,
    transition:
      service === "animation" ? data.get("transition") === "yes" : null,
    commercial: service !== "chibi" ? data.get("commercial") === "yes" : null,
    background:
      service === "animation" ? data.get("background") === "yes" : null,
    rush: service !== "stickers" ? data.get("rush") === "yes" : null,
    payment: data.get("payment"),
    allowLivestream: config.services[service].livePermission
      ? data.get("allowLivestream") === "yes"
      : null,
    allowPortfolio: data.get("allowPortfolio") === "yes",
    notes: config.services[service].notes
      ? (data.get("notes") || "").trim()
      : null,
    rulesReviewed,
    priceConfirmed: false,
    estimatedPrice: estimateCommission(config, selection),
  };
}
