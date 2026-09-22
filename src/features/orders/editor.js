import { ORDER_STATUSES, validateUpdate } from "./contract.js";
import {
  element,
  serviceNames,
  dateLabel,
  notificationNames,
} from "./presentation.js";
import { formatPriceRange } from "../commission/pricing.js";

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
    form.querySelector("#edit-heading").textContent =
      `${order.orderId} · ${serviceNames[order.service]}`;
    form.querySelector("#edit-estimate").textContent =
      `目前預估 ${formatPriceRange(details.estimatedPrice.min, details.estimatedPrice.max, details.estimatedPrice.currency)}；仍需由繪師確認報價。`;
    for (const key of ["status", "publicNote", "adminNote"])
      fields[key].value = order[key];
    fields.isRush.checked = order.isRush;
    fields.isOnHold.checked = order.isOnHold;
    fields.nickname.value = details.nickname;
    fields.contactChannel.value = details.contact.channel;
    fields.contact.value = details.contact.value;
    fields.referenceUrl.value = details.referenceUrl;
    form.querySelector("#edit-reference").href = details.referenceUrl;
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
    form.querySelector("#notification-status").textContent =
      `Telegram：${notificationNames[order.notificationStatus] || "待確認"}（已嘗試 ${order.notificationAttempts} 次）`;
    form.querySelector("#admin-retry").disabled =
      order.notificationStatus === "sent";
    const history = form.querySelector("#edit-history");
    history.replaceChildren(
      ...order.history
        .slice()
        .reverse()
        .map((event) =>
          element(
            "li",
            `${dateLabel(event.at)} · ${event.action === "created" ? "收到委託" : "管理員 " + event.actor + " 更新"} · 第 ${event.revision} 版`,
          ),
        ),
    );
  }
  function collect(order) {
    const details = structuredClone(order.details);
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
    const payload = {
      orderId: order.orderId,
      revision: order.revision,
      details,
      status: fields.status.value,
      isRush: fields.isRush.checked,
      isOnHold: fields.isOnHold.checked,
      publicNote: fields.publicNote.value,
      adminNote: fields.adminNote.value,
    };
    validateUpdate(payload, order, config);
    return payload;
  }
  return { fill, collect };
}
