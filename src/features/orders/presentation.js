import { ORDER_STATUSES } from "./contract.js";

export const serviceNames = {
  animation: "角色動畫",
  stickers: "貼圖包",
  chibi: "小動圖",
};
export const notificationNames = {
  pending: "等待通知",
  sending: "通知傳送中",
  sent: "已通知",
  failed: "通知失敗",
  unknown: "無法確認通知結果",
};

export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "尚無更新時間"
    : new Intl.DateTimeFormat("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
}

export function renderProgress(order) {
  const article = element("article", undefined, "progress-row");
  article.id = order.orderId;
  const heading = element("div");
  heading.append(
    element("h2", serviceNames[order.service] || "委託"),
    element("small", order.orderId),
  );
  const status = element("div", undefined, "progress-state");
  status.append(
    element("strong", ORDER_STATUSES[order.status] || "待確認", "stage-label"),
  );
  status.append(renderFlags(order));
  const detail = element("div");
  detail.append(
    element("p", order.publicNote || "繪師更新後，會在這裡顯示進度。"),
    element("small", `更新於 ${dateLabel(order.updatedAt)}`),
  );
  article.append(heading, status, detail);
  return article;
}

export function renderFlags(order) {
  const flags = element("span", undefined, "order-flags");
  if (order.isRush)
    flags.append(element("span", "急件", "order-flag flag-rush"));
  if (order.isOnHold)
    flags.append(element("span", "擱置", "order-flag flag-hold"));
  return flags;
}
