import { estimateCommission } from "../commission/pricing.js";
import { ATTACHMENT_MAX_FILES, ATTACHMENT_MAX_TOTAL_BYTES, attachmentFileError } from "./attachment-contract.js";

export const ORDER_STATUSES = {
  queued: "排隊中",
  drafting: "草稿繪製中",
  draft_review: "草稿確認",
  awaiting_payment: "等待付款",
  finalizing: "完稿中",
  awaiting_balance: "待付尾款",
  delivered: "已交稿",
};

// 舊狀態只在讀取時對應，保留 Sheet 原值直到管理員儲存，歷史快照仍記錄原值。
const LEGACY_STATUSES = {
  received: "queued",
  discussing: "queued",
  working: "finalizing",
  reviewing: "draft_review",
  completed: "delivered",
  cancelled: "queued",
};

export function orderWorkflow(order) {
  const status = Object.hasOwn(ORDER_STATUSES, order.status)
    ? order.status
    : Object.hasOwn(LEGACY_STATUSES, order.status)
      ? LEGACY_STATUSES[order.status]
      : null;
  requireValue(
    Boolean(status),
    "訂單含有未知的工作階段，請由維護者檢查。",
    "CONFIG",
  );
  // 舊列缺少旗標時，急件沿用收件需求；舊取消單保留為擱置，避免視為正常排隊。
  const details = order.details ||
    (order.detailsJson ? JSON.parse(order.detailsJson) : {});
  return {
    status,
    isRush: typeof order.isRush === "boolean"
      ? order.isRush
      : details.rush === true,
    isOnHold: typeof order.isOnHold === "boolean"
      ? order.isOnHold
      : order.status === "cancelled",
    // 未設定本站封存狀態的舊列沿用 Trello；明確解除封存後不再被來源值覆蓋。
    isArchived: typeof order.isArchived === "boolean"
      ? order.isArchived
      : orderSource(order)?.archived === true,
  };
}

export class OrderError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function requireValue(condition, message, code = "VALIDATION") {
  if (!condition) throw new OrderError(code, message);
}

export function textField(value, label, max, required = true) {
  requireValue(typeof value === "string", `${label}格式不正確。`);
  const text = value.trim();
  requireValue(
    (!required || text.length > 0) && text.length <= max,
    `${label}${required ? "不可留白，且" : ""}不可超過 ${max} 字元。`,
  );
  requireValue(
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text),
    `${label}含有無效字元。`,
  );
  return text;
}

export function httpsReference(value) {
  const url = textField(value, "參考素材連結", 2000);
  // Apps Script 沒有瀏覽器 URL 類別；只接受可分享的 HTTPS 網址，不在伺服器抓取內容。
  requireValue(
    /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::443)?(?:[/?#][^\s]*)?$/i.test(
      url,
    ),
    "請提供不含帳號密碼的 HTTPS 參考素材連結。",
  );
  return url;
}

/** 從不信任的 JSON 重建白名單欄位；前端金額、訂單狀態與授權身分一律不採用。 */
export function validateSubmission(input, config, { hasAttachments = false, allowPreviousVersion = false } = {}) {
  requireValue(
    input && typeof input === "object" && !Array.isArray(input),
    "委託內容格式不正確。",
  );
  requireValue(
    input.schemaVersion === config.version || (allowPreviousVersion && input.schemaVersion === 3),
    "表單版本已更新，請重新整理後填寫。",
    "VERSION",
  );
  const service = input.service;
  requireValue(
    ["animation", "stickers", "chibi"].includes(service),
    "請選擇有效的委託類型。",
  );
  const boolean = (key) => {
    const labels = {
      allowPortfolio: "作品展示授權",
      allowLivestream: "直播繪製授權",
      commercial: "商業用途",
      transition: "加購轉場",
      background: "背景與特效",
      rush: "急件",
    };
    requireValue(typeof input[key] === "boolean", `請明確選擇${labels[key]}。`);
    return input[key];
  };
  const details = {
    schemaVersion: config.version,
    service,
    nickname: textField(input.nickname, "暱稱", 80),
    contact: {
      channel: input.contact?.channel,
      value: textField(input.contact?.value, "聯絡方式", 300),
    },
    referenceUrl: input.referenceUrl ? httpsReference(input.referenceUrl) : "",
    stickerIds: [],
    chibiPlan: null,
    characterCount: null,
    transition: null,
    commercial: null,
    background: null,
    rush: null,
    payment: input.payment,
    allowLivestream: null,
    allowPortfolio: boolean("allowPortfolio"),
    notes: null,
    rulesReviewed: input.rulesReviewed,
    priceConfirmed: false,
  };
  requireValue(Boolean(details.referenceUrl) || hasAttachments, "請上傳至少一個參考檔案，或提供參考素材連結。");
  requireValue(
    ["telegram", "facebook", "discord"].includes(details.contact.channel),
    "聯絡平台不正確。",
  );
  if (details.contact.channel === "facebook") {
    requireValue(
      /^https:\/\/(?:[a-z0-9-]+\.)*facebook\.com(?:[/?#]|$)|^https:\/\/fb\.me(?:[/?#]|$)/i.test(
        details.contact.value,
      ),
      "請提供有效的 Facebook 個人頁面 HTTPS 連結。",
    );
  }
  requireValue(
    ["bank", "paypal"].includes(details.payment),
    "付款方式不正確。",
  );
  requireValue(details.rulesReviewed === true, "請先閱讀委託說明。");
  if (service === "stickers") {
    requireValue(
      Array.isArray(input.stickerIds) &&
        input.stickerIds.length > 0 &&
        input.stickerIds.length <= 48,
      "請選擇 1–48 款貼圖。",
    );
    const allowed = config.stickerOptions.map((item) => item.number);
    requireValue(
      input.stickerIds.every(
        (id) => Number.isInteger(id) && allowed.includes(id),
      ),
      "包含未開放的貼圖款式。",
    );
    requireValue(
      new Set(input.stickerIds).size === input.stickerIds.length,
      "貼圖款式不可重複。",
    );
    details.stickerIds = [...input.stickerIds].sort((a, b) => a - b);
  } else {
    requireValue(
      [1, 2].includes(input.characterCount),
      "角色人數必須是 1 或 2。",
    );
    details.characterCount = input.characterCount;
    details.rush = boolean("rush");
  }
  if (service === "chibi") {
    requireValue(
      ["illustration", "animated"].includes(input.chibiPlan),
      "請選擇小動圖方案。",
    );
    details.chibiPlan = input.chibiPlan;
  } else {
    details.commercial = boolean("commercial");
    details.allowLivestream = boolean("allowLivestream");
    details.notes = textField(input.notes, "特殊需求", 4000, false);
  }
  if (service === "animation") {
    details.transition = boolean("transition");
    details.background = boolean("background");
  }
  const selection = { ...details };
  for (const key of ["transition", "commercial", "background", "rush"]) {
    selection[key] = details[key] === null ? null : details[key] ? "yes" : "no";
  }
  return { ...details, estimatedPrice: estimateCommission(config, selection) };
}

/** 進度只輸出這份投影，禁止直接序列化 Sheets 完整資料列。 */
export function publicOrder(order) {
  const source = orderSource(order);
  return {
    orderId: order.orderId,
    service: order.service,
    ...orderWorkflow(order),
    // 舊版隱藏列也列出匿名工作狀態，但不順帶公開當時隱藏的說明。
    publicNote: order.publicVisible === false ? "" : order.publicNote,
    updatedAt: order.updatedAt,
    ...(!source ? { displayTitle: order.nickname || order.details?.nickname || order.orderId } : {}),
    ...(source?.publishTitle === true
      ? {
          displayTitle: source.cardName,
          sourceArchived: source.archived,
          trelloCreatedAt: source.createdAt,
          trelloUpdatedAt: source.lastActivity,
          importedAt: source.importedAt,
        }
      : {}),
  };
}

export function orderSource(order) {
  const source = order.source || (order.sourceJson ? JSON.parse(order.sourceJson) : null);
  // 舊匯入已有不可變的 Card ID，讀取時即可補齊建立時間，不改寫訂單或歷史。
  return source?.kind === "trello"
    ? { ...source, createdAt: trelloCreatedAt(source.cardId) }
    : null;
}

/** Trello 官方採 Mongo ID；前 8 個十六進位字元是建立時的 Unix 秒數。 */
export function trelloCreatedAt(cardId) {
  return typeof cardId === "string" && /^[a-f0-9]{24}$/.test(cardId)
    ? new Date(parseInt(cardId.slice(0, 8), 16) * 1000).toISOString()
    : null;
}

export function validateUpdate(input, current, config) {
  requireValue(
    input.revision === Number(current.revision),
    "這筆委託已被更新，請重新載入後再修改。",
    "CONFLICT",
  );
  requireValue(Object.hasOwn(ORDER_STATUSES, input.status), "委託狀態不正確。");
  requireValue(typeof input.isRush === "boolean", "請選擇是否標記急件。");
  requireValue(typeof input.isOnHold === "boolean", "請選擇是否標記擱置。");
  requireValue(input.isArchived === undefined || typeof input.isArchived === "boolean", "封存狀態不正確。");
  const currentDetails = current.details || JSON.parse(current.detailsJson);
  const details = orderSource(current) ? currentDetails : validateSubmission(input.details, config, {
    hasAttachments: Boolean(currentDetails.attachments?.length), allowPreviousVersion: true,
  });
  // 附件只能由上傳流程建立；管理欄位更新保留伺服器既有附件，拒絕客戶端換入其他 Drive ID。
  if (currentDetails.attachments) details.attachments = currentDetails.attachments;
  return {
    // 歷史訂單沒有完整表單資料；以伺服器保存的內容為準，不接受客戶端補造報價或授權。
    details,
    status: input.status,
    isRush: input.isRush,
    isOnHold: input.isOnHold,
    // 舊管理分頁未傳新欄位時保留目前值，避免編輯其他內容意外解除封存。
    isArchived: input.isArchived === undefined ? orderWorkflow(current).isArchived : input.isArchived,
    publicNote: textField(input.publicNote, "公開進度說明", 500, false),
    adminNote: textField(input.adminNote, "內部備註", 4000, false),
  };
}

export function attachmentManifest(input = []) {
  requireValue(Array.isArray(input) && input.length <= ATTACHMENT_MAX_FILES, "最多可上傳 5 個參考檔案。");
  const files = input.map((file) => {
    const error = attachmentFileError(file);
    requireValue(!error, error);
    const name = textField(file.name, "檔名", 150);
    requireValue(!/[\\/\x7f]/.test(name), "檔名不可包含路徑。");
    requireValue(typeof file.type === "string" && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(file.type) && file.type.length <= 100,
      "檔案類型不正確。");
    requireValue(typeof file.sha256 === "string" && /^[a-f0-9]{64}$/.test(file.sha256), "檔案識別不正確。");
    return { name, type: file.type.toLowerCase(), size: file.size, sha256: file.sha256 };
  });
  requireValue(files.reduce((sum, file) => sum + file.size, 0) <= ATTACHMENT_MAX_TOTAL_BYTES,
    "參考檔案合計最多 45 MB；較大素材請改用連結。");
  return files;
}
