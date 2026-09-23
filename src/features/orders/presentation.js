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
  not_required: "歷史訂單，不發送收件通知",
};

export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

export function dateLabel(value) {
  if (typeof value !== "string" || !value) return "尚無時間";
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
        timeZone: "Asia/Taipei",
      }).format(date);
}

export function renderProgress(order) {
  const article = element("article", undefined, "progress-card");
  article.id = order.orderId;
  article.append(element("span", serviceNames[order.service] || "委託", `card-service service-${order.service}`));
  const flags = renderFlags(order);
  if (flags.childElementCount) article.append(flags);
  article.append(element("h3", order.displayTitle || order.orderId));
  if (order.publicNote) article.append(element("p", order.publicNote, "card-note"));
  return article;
}

export function renderFlags(order) {
  const flags = element("span", undefined, "order-flags");
  if (order.isRush)
    flags.append(element("span", "急件", "order-flag flag-rush"));
  if (order.isOnHold)
    flags.append(element("span", "擱置", "order-flag flag-hold"));
  if (order.isArchived)
    flags.append(element("span", "封存", "order-flag flag-hold"));
  return flags;
}
