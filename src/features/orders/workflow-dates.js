import { orderWorkflow, requireValue, revenueDate, taipeiDate } from "./contract.js";

/** 起算日不算一天，工作天只排除週六、週日；使用 UTC 計算日曆避免瀏覽器時區差異。 */
export function addWorkingDays(start, days) {
  requireValue(Number.isSafeInteger(days) && days >= 0, "工作天數不正確。");
  requireValue(Boolean(start), "請提供起算日期。");
  const date = new Date(`${revenueDate(start)}T00:00:00.000Z`);
  for (let remaining = days; remaining > 0; ) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (![0, 6].includes(date.getUTCDay())) remaining--;
  }
  return revenueDate(date.toISOString().slice(0, 10));
}

function deliveryWorkingDays(order) {
  if (order.service === "animation") return 7;
  if (order.service === "chibi") return 3;
  if (order.service !== "stickers") return null;
  const ids = order.details?.stickerIds;
  // 歷史匯入可能沒有張數，不能從卡片名稱猜測工期。
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => !Number.isInteger(id) || id < 1))
    return null;
  return Math.ceil(new Set(ids).size / 12) * 3;
}

/** 僅在指定的階段轉換產生日期；前端預填與後端保存共用相同規則。 */
export function workflowDateDefaults(order, nextStatus, now = new Date().toISOString()) {
  const previous = orderWorkflow(order).status;
  const next = orderWorkflow({ status: nextStatus }).status;
  if (previous === next) return {};
  const today = taipeiDate(now);
  const dates = {};
  if (next === "delivered") dates.deliveredOn = today;
  else if (previous === "delivered") dates.deliveredOn = null;
  if (["drafting", "draft_review"].includes(previous) && next === "finalizing")
    dates.depositReceivedOn = today;
  if (previous === "queued" && next === "drafting") {
    const days = deliveryWorkingDays(order);
    if (days !== null) dates.expectedDeliveryOn = addWorkingDays(today, days);
  }
  return dates;
}
