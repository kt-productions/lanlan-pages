import { estimateCommission } from "../commission/pricing.js";
import {
  ATTACHMENT_MAX_FILES,
  ATTACHMENT_MAX_TOTAL_BYTES,
  attachmentFileError,
} from "./attachment-contract.js";

export const ORDER_STATUSES = {
  queued: "排隊中",
  drafting: "草稿繪製中",
  draft_review: "草稿確認/等待付款",
  finalizing: "完稿中",
  awaiting_balance: "待付尾款",
  delivered: "已交稿",
};

// 舊狀態只在讀取時對應，保留 Sheet 原值直到管理員儲存，歷史快照仍記錄原值。
const LEGACY_STATUSES = {
  awaiting_payment: "draft_review",
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
  requireValue(Boolean(status), "訂單含有未知的工作階段，請由維護者檢查。", "CONFIG");
  // 舊列缺少旗標時，急件沿用收件需求；舊取消單保留為擱置，避免視為正常排隊。
  const details = order.details || (order.detailsJson ? JSON.parse(order.detailsJson) : {});
  return {
    status,
    isRush: typeof order.isRush === "boolean" ? order.isRush : details.rush === true,
    isOnHold: typeof order.isOnHold === "boolean" ? order.isOnHold : order.status === "cancelled",
    // 未設定本站封存狀態的舊列沿用 Trello；明確解除封存後不再被來源值覆蓋。
    isArchived:
      typeof order.isArchived === "boolean"
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
  requireValue(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text), `${label}含有無效字元。`);
  return text;
}

export function httpsReference(value) {
  const url = textField(value, "參考素材連結", 2000);
  // Apps Script 沒有瀏覽器 URL 類別；只接受可分享的 HTTPS 網址，不在伺服器抓取內容。
  requireValue(
    /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::443)?(?:[/?#][^\s]*)?$/i.test(url),
    "請提供不含帳號密碼的 HTTPS 參考素材連結。",
  );
  return url;
}

/** 從不信任的 JSON 重建白名單欄位；前端金額、訂單狀態與授權身分一律不採用。 */
export function validateSubmission(
  input,
  config,
  { hasAttachments = false, allowPreviousVersion = false } = {},
) {
  requireValue(input && typeof input === "object" && !Array.isArray(input), "委託內容格式不正確。");
  requireValue(
    input.schemaVersion === config.version || (allowPreviousVersion && input.schemaVersion === 3),
    "表單版本已更新，請重新整理後填寫。",
    "VERSION",
  );
  const service = input.service;
  requireValue(["animation", "stickers", "chibi"].includes(service), "請選擇有效的委託類型。");
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
  requireValue(
    Boolean(details.referenceUrl) || hasAttachments,
    "請上傳至少一個參考檔案，或提供參考素材連結。",
  );
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
  requireValue(["bank", "paypal"].includes(details.payment), "付款方式不正確。");
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
      input.stickerIds.every((id) => Number.isInteger(id) && allowed.includes(id)),
      "包含未開放的貼圖款式。",
    );
    requireValue(new Set(input.stickerIds).size === input.stickerIds.length, "貼圖款式不可重複。");
    details.stickerIds = [...input.stickerIds].sort((a, b) => a - b);
  } else {
    requireValue([1, 2].includes(input.characterCount), "角色人數必須是 1 或 2。");
    details.characterCount = input.characterCount;
    details.rush = boolean("rush");
  }
  if (service === "chibi") {
    requireValue(["illustration", "animated"].includes(input.chibiPlan), "請選擇小動圖方案。");
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
    // 舊版隱藏列依現行規則顯示暱稱及工作狀態，但不順帶公開當時隱藏的說明。
    publicNote: order.publicVisible === false ? "" : order.publicNote,
    createdAt: source?.createdAt || order.createdAt,
    updatedAt: order.updatedAt,
    ...(!source
      ? { displayTitle: order.nickname || order.details?.nickname || order.orderId }
      : {}),
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

/** 已交稿按最後更新由新到舊；未交稿維持原始建立時間由舊到新。 */
export function compareBoardOrders(a, b) {
  const firstDelivered = orderWorkflow(a).status === "delivered";
  const secondDelivered = orderWorkflow(b).status === "delivered";
  // 混合快照先分交稿範圍，避免兩種時間方向交錯造成不一致的比較結果。
  if (firstDelivered !== secondDelivered) return firstDelivered ? 1 : -1;
  const timestamp = (order) => {
    const value = Date.parse(
      firstDelivered
        ? order.updatedAt
        : orderSource(order)?.createdAt || order.trelloCreatedAt || order.createdAt,
    );
    // 無有效時間者放在所屬範圍最後，不把建立日或來源活動日當成最後更新。
    return Number.isFinite(value) ? (firstDelivered ? -value : value) : Infinity;
  };
  const first = timestamp(a);
  const second = timestamp(b);
  return (
    (first === second ? 0 : first < second ? -1 : 1) ||
    String(a.orderId).localeCompare(String(b.orderId))
  );
}

export function validateUpdate(input, current, config) {
  requireValue(
    input.revision === Number(current.revision),
    "這筆委託已被更新，請重新載入後再修改。",
    "CONFLICT",
  );
  // 已開啟的舊管理頁仍可能送出等待付款；統一保存為合併後的階段。
  const status = input.status === "awaiting_payment" ? "draft_review" : input.status;
  requireValue(Object.hasOwn(ORDER_STATUSES, status), "委託狀態不正確。");
  requireValue(typeof input.isRush === "boolean", "請選擇是否標記急件。");
  requireValue(typeof input.isOnHold === "boolean", "請選擇是否標記擱置。");
  requireValue(
    input.isArchived === undefined || typeof input.isArchived === "boolean",
    "封存狀態不正確。",
  );
  const currentDetails = current.details || JSON.parse(current.detailsJson);
  const imported = Boolean(orderSource(current));
  const details = imported
    ? { ...currentDetails }
    : validateSubmission(input.details, config, {
        hasAttachments: Boolean(currentDetails.attachments?.length),
        allowPreviousVersion: true,
      });
  // 附件只能由上傳流程建立；管理欄位更新保留伺服器既有附件，拒絕客戶端換入其他 Drive ID。
  if (currentDetails.attachments) details.attachments = currentDetails.attachments;
  // 管理報價與系統預估分開；拖曳及舊管理頁未傳 quote 時保留已儲存金額。
  if (input.quote !== undefined) details.quote = validateQuote(input.quote, imported);
  else if (Object.hasOwn(currentDetails, "quote")) details.quote = currentDetails.quote;
  // 收款與日期只接受管理欄位；舊頁、拖曳及偽造的表單 details 都不能清掉原值。
  if (input.revenue !== undefined) details.revenue = validateRevenue(input.revenue, details.quote);
  else if (Object.hasOwn(currentDetails, "revenue")) details.revenue = currentDetails.revenue;
  if (details.revenue?.depositAmount > 0) {
    requireValue(
      details.quote &&
        quoteCents(details.revenue.depositAmount) <= quoteCents(details.quote.amount),
      "訂金不可超過訂單金額；清除金額前請先清除訂金紀錄。",
    );
  }
  return {
    // 歷史訂單只允許獨立報價欄位，不接受客戶端補造原表單或授權。
    details,
    status,
    isRush: input.isRush,
    isOnHold: input.isOnHold,
    // 舊管理分頁未傳新欄位時保留目前值，避免編輯其他內容意外解除封存。
    isArchived:
      input.isArchived === undefined ? orderWorkflow(current).isArchived : input.isArchived,
    publicNote: textField(input.publicNote, "公開進度說明", 500, false),
    adminNote: textField(input.adminNote, "內部備註", 4000, false),
  };
}

export const QUOTE_MAX_AMOUNT = 9999999.99;
export const QUOTE_MAX_ITEMS = 50;

/** 使用台灣日曆日期，避免 UTC 的月底／跨年偏移；空值表示待補，不猜測日期。 */
export function revenueDate(value, label = "日期") {
  if (value === null || value === "") return null;
  requireValue(
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
    `${label}格式不正確。`,
  );
  const date = new Date(`${value}T00:00:00.000Z`);
  requireValue(
    Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      Number(value.slice(0, 4)) >= 1900 &&
      Number(value.slice(0, 4)) <= 9999,
    `${label}不是有效日期。`,
  );
  return value;
}

export function taipeiDate(value) {
  const time = Date.parse(value);
  return Number.isFinite(time)
    ? new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;
}

export function validateRevenue(input, quote) {
  requireValue(input && typeof input === "object" && !Array.isArray(input), "收益資料格式不正確。");
  const deposit = quoteCents(input.depositAmount, "已收訂金");
  requireValue(
    !deposit || (quote && deposit <= quoteCents(quote.amount)),
    "請先設定訂單金額，且訂金不可超過訂單金額。",
  );
  const depositReceivedOn = revenueDate(input.depositReceivedOn, "訂金收款日");
  // 指定階段轉換可先記錄收款日期；未填金額時不推定訂金，也不計入金額收益。
  return {
    depositAmount: deposit / 100,
    depositReceivedOn,
    expectedDeliveryOn: revenueDate(input.expectedDeliveryOn, "預計交稿日"),
    deliveredOn: revenueDate(input.deliveredOn, "實際交稿日"),
  };
}

/** 以整數分驗證及加總；金額接受數值或欄位字串，但不接受指數或超過兩位小數。 */
export function quoteCents(value, label = "金額", allowNegative = false) {
  requireValue(
    (typeof value === "string" || typeof value === "number") &&
      /^-?\d+(?:\.\d{1,2})?$/.test(String(value)),
    `${label}請填寫最多兩位小數的金額。`,
  );
  const amount = Number(value);
  requireValue(
    Number.isFinite(amount) &&
      Math.abs(amount) <= QUOTE_MAX_AMOUNT &&
      (allowNegative || amount >= 0),
    `${label}須介於${allowNegative ? " -9,999,999.99" : " 0"} 與 9,999,999.99 元之間。`,
  );
  return Math.round(amount * 100);
}

/** 只有已驗證的管理更新可寫入；收件及公開投影不採用這份資料。 */
export function validateQuote(input, imported = false) {
  if (input === null) return null;
  requireValue(
    input && typeof input === "object" && !Array.isArray(input) && input.currency === "TWD",
    "訂單金額格式不正確，幣別須為新台幣。",
  );
  if (imported) {
    requireValue(input.items === null, "Trello 歷史訂單只提供總金額，不提供明細。");
    return { currency: "TWD", amount: quoteCents(input.amount, "訂單總金額") / 100, items: null };
  }
  requireValue(
    Array.isArray(input.items) && input.items.length >= 1 && input.items.length <= QUOTE_MAX_ITEMS,
    `請提供 1–${QUOTE_MAX_ITEMS} 筆金額明細。`,
  );
  const items = input.items.map((item, index) => ({
    label: textField(item?.label, `第 ${index + 1} 筆項目名稱`, 120),
    amount: quoteCents(item?.amount, `第 ${index + 1} 筆金額`, true) / 100,
  }));
  const cents = items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
  requireValue(
    cents >= 0 && cents <= Math.round(QUOTE_MAX_AMOUNT * 100),
    "明細加總須介於 0 與 9,999,999.99 元之間。",
  );
  // 總額由伺服器重新加總，不採用客戶端自行提供的 amount。
  return { currency: "TWD", amount: cents / 100, items };
}

export function attachmentManifest(input = []) {
  requireValue(
    Array.isArray(input) && input.length <= ATTACHMENT_MAX_FILES,
    "最多可上傳 5 個參考檔案。",
  );
  const files = input.map((file) => {
    const error = attachmentFileError(file);
    requireValue(!error, error);
    const name = textField(file.name, "檔名", 150);
    requireValue(!/[\\/\x7f]/.test(name), "檔名不可包含路徑。");
    requireValue(
      typeof file.type === "string" &&
        /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(file.type) &&
        file.type.length <= 100,
      "檔案類型不正確。",
    );
    requireValue(
      typeof file.sha256 === "string" && /^[a-f0-9]{64}$/.test(file.sha256),
      "檔案識別不正確。",
    );
    return { name, type: file.type.toLowerCase(), size: file.size, sha256: file.sha256 };
  });
  requireValue(
    files.reduce((sum, file) => sum + file.size, 0) <= ATTACHMENT_MAX_TOTAL_BYTES,
    "參考檔案合計最多 45 MB；較大素材請改用連結。",
  );
  return files;
}
