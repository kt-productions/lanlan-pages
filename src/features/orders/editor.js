import { ORDER_STATUSES, validateUpdate } from "./contract.js";
import {
  element,
  serviceNames,
  dateLabel,
  notificationNames,
} from "./presentation.js";
import { formatPriceRange } from "../commission/pricing.js";
import { setupQuoteEditor } from "./quote-editor.js";
import { setupRevenueEditor } from "./revenue-editor.js";

const choices = {
  payment: [
    "付款方式",
    [
      ["bank", "轉帳／匯款"],
      ["paypal", "PayPal"],
    ],
  ],
  characterCount: [
    "角色人數",
    [
      ["1", "單人"],
      ["2", "雙人"],
    ],
  ],
  chibiPlan: [
    "小動圖方案",
    [
      ["illustration", "插圖"],
      ["animated", "插圖＋動畫"],
    ],
  ],
  transition: ["加購轉場"],
  commercial: ["商業用途"],
  background: ["需要背景與特效"],
  rush: ["急件需求（影響報價）"],
  allowLivestream: ["同意直播繪製"],
  allowPortfolio: ["同意用作作品範例"],
};

export function setupEditor(form, config) {
  const quote = setupQuoteEditor(form);
  const revenue = setupRevenueEditor(form);
  const options = form.querySelector("#edit-options");
  const fields = form.elements;
  for (const [value, label] of Object.entries(ORDER_STATUSES)) {
    const option = element("option", label);
    option.value = value;
    fields.status.append(option);
  }
  function fill(order) {
    form.hidden = false;
    const details = order.details;
    const imported = Boolean(order.source);
    form.querySelector("#edit-heading").textContent =
      `${order.source?.cardName || details.nickname} · ${serviceNames[order.service]}`;
    form.querySelector("#edit-order-id").textContent = `委託編號：${order.orderId}`;
    form.querySelector("#edit-estimate").textContent =
      imported ? "Trello 歷史訂單；原始聯絡方式、需求、報價與授權未提供，可另外記錄訂單金額。" :
      `目前預估 ${formatPriceRange(details.estimatedPrice.min, details.estimatedPrice.max, details.estimatedPrice.currency)}；仍需由繪師確認報價。`;
    quote.fill(order);
    for (const key of ["status", "publicNote", "adminNote"])
      fields[key].value = order[key];
    revenue.fill(order);
    fields.isRush.checked = order.isRush;
    fields.isOnHold.checked = order.isOnHold;
    fields.isArchived.checked = order.isArchived;
    const content = form.querySelector("#edit-content");
    content.hidden = content.disabled = imported;
    const sourcePanel = form.querySelector("#edit-source");
    sourcePanel.hidden = !imported;
    sourcePanel.replaceChildren();
    if (imported) {
      sourcePanel.append(
        element("h3", order.source.cardName),
        element("p", `${order.source.boardName} · 原欄位：${order.source.listName}`),
        element("p", `原標籤：${order.source.labels.join("、") || "無"}${order.source.archived ? " · 原卡片已封存" : ""}`),
        element("p", `Trello 建立：${dateLabel(order.source.createdAt)}`),
        element("p", `Trello 最後活動：${dateLabel(order.source.lastActivity)}`),
        element("p", `匯入本站：${dateLabel(order.source.importedAt)}`),
        element("p", "以上為台灣時間。Trello 最後活動包含卡片移動、內容或標籤等異動，不一定代表製作進度更新。"),
        element("p", "可更新製作進度、金額與備註；原標籤只作來源紀錄，不代表本站確認的付款或報價。"),
      );
      const link = element("a", "查看原 Trello 卡片");
      link.href = order.source.cardUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      sourcePanel.append(link);
      for (const attachment of order.source.attachments || []) {
        const row = element("p");
        const attachmentLink = element("a", `來源附件：${attachment.name || "圖片"}`);
        attachmentLink.href = attachment.url;
        attachmentLink.target = "_blank";
        attachmentLink.rel = "noopener noreferrer";
        row.append(attachmentLink);
        sourcePanel.append(row);
      }
    }
    if (!imported) {
      fields.nickname.value = details.nickname;
      fields.contactChannel.value = details.contact.channel;
      fields.contact.value = details.contact.value;
      fields.referenceUrl.value = details.referenceUrl;
      fields.referenceUrl.required = !details.attachments?.length;
      form.querySelector("#edit-reference").href = details.referenceUrl;
      form.querySelector("#edit-reference").hidden = !details.referenceUrl;
      fields.notes.value = details.notes || "";
      fields.notes.disabled = details.notes === null;
      form.querySelector("#edit-notes-label").hidden = details.notes === null;
      options.replaceChildren();
      if (order.service === "stickers") {
        const label = element("label", "貼圖編號（以逗號分隔）");
        const input = element("input");
        input.name = "stickerIds";
        input.value = details.stickerIds.join(", ");
        input.required = true;
        input.maxLength = 200;
        label.append(input);
        options.append(label);
      }
      for (const [key, [name, values]] of Object.entries(choices)) {
        if (details[key] === null) continue;
        const label = element("label", name);
        const select = element("select");
        select.name = key;
        for (const [value, text] of values || [
          ["yes", "是"],
          ["no", "否"],
        ]) {
          const option = element("option", text);
          option.value = value;
          select.append(option);
        }
        select.value =
          typeof details[key] === "boolean"
            ? details[key]
              ? "yes"
              : "no"
            : String(details[key]);
        label.append(select);
        options.append(label);
      }
    }
    form.querySelector("#notification-status").textContent =
      `Telegram：${notificationNames[order.notificationStatus] || "待確認"}（已嘗試 ${order.notificationAttempts} 次）`;
    form.querySelector("#admin-retry").disabled =
      ["sent", "not_required"].includes(order.notificationStatus);
    form.querySelector("#notification-hint").hidden = imported;
    const history = form.querySelector("#edit-history");
    history.replaceChildren(
      ...order.history
        .slice()
        .reverse()
        .map((event) =>
          element(
            "li",
            `${dateLabel(event.at)} · ${event.action === "created" ? "收到委託" : event.action === "imported" ? "從 Trello 匯入" : "管理員 " + event.actor + " 更新"} · 第 ${event.revision} 版`,
          ),
        ),
    );
  }
  function collect(order) {
    const details = structuredClone(order.details);
    if (!order.source) {
      details.nickname = fields.nickname.value;
      details.contact = {
        channel: fields.contactChannel.value,
        value: fields.contact.value,
      };
      details.referenceUrl = fields.referenceUrl.value;
      if (details.notes !== null) details.notes = fields.notes.value;
      if (order.service === "stickers")
        details.stickerIds = fields.stickerIds.value
          .split(/[,，、\s]+/)
          .filter(Boolean)
          .map(Number);
      for (const key of Object.keys(choices)) {
        if (details[key] === null) continue;
        details[key] =
          typeof details[key] === "boolean"
            ? fields[key].value === "yes"
            : key === "characterCount"
              ? Number(fields[key].value)
              : fields[key].value;
      }
    }
    const payload = {
      orderId: order.orderId,
      revision: order.revision,
      details,
      quote: quote.collect(),
      revenue: revenue.collect(),
      status: fields.status.value,
      isRush: fields.isRush.checked,
      isOnHold: fields.isOnHold.checked,
      isArchived: fields.isArchived.checked,
      publicNote: fields.publicNote.value,
      adminNote: fields.adminNote.value,
    };
    validateUpdate(payload, order, config);
    return payload;
  }
  return { fill, collect, clear() { quote.clear(); revenue.clear(); } };
}
