/** 只投影填單內容；不把內部備註、Drive 識別碼或登入資料送進通知。 */
function orderNotificationText_(order) {
  const details = JSON.parse(order.detailsJson);
  const estimate = details.estimatedPrice;
  const contacts = { telegram: "Telegram", facebook: "Facebook", discord: "Discord" };
  const payments = { bank: "轉帳／匯款", paypal: "PayPal" };
  const yesNo = function (value) { return value === null || value === undefined ? "此表單未詢問" : value ? "是" : "否"; };
  const lines = [
    "收到新的委託",
    "編號：" + order.orderId,
    "委託類型：" + COMMISSION_CONFIG_.services[order.service].name,
    "暱稱：" + details.nickname,
    "聯絡平台：" + contacts[details.contact.channel],
    "聯絡方式：" + details.contact.value,
    "",
    "【委託選項】",
  ];
  if (order.service === "stickers") lines.push("貼圖款式（" + details.stickerIds.length + " 款）：" +
    details.stickerIds.map(function (id) { return "No." + id; }).join("、"));
  if (order.service === "chibi") lines.push("委託方案：" + (details.chibiPlan === "animated" ? "插圖＋動畫" : "插圖"));
  if (details.characterCount !== null) lines.push("角色人數：" + (details.characterCount === 2 ? "雙人" : "單人"));
  if (details.transition !== null) lines.push("循環動畫加購轉場：" + (details.transition ? "加購" : "不加購"));
  if (details.background !== null) lines.push("背景與特效：" + (details.background ? "需要" : "單色／無背景"));
  if (details.rush !== null) lines.push("急件：" + (details.rush ? "是，需討論" : "否"));
  lines.push("是否為商用：" + yesNo(details.commercial),
    "付款方式：" + payments[details.payment],
    "可否直播繪製：" + yesNo(details.allowLivestream),
    "可否當作品範例：" + yesNo(details.allowPortfolio),
    "已閱讀委託說明與製作流程：" + yesNo(details.rulesReviewed),
    "", "【參考素材】", "參考連結：" + (details.referenceUrl || "未填寫"));
  const attachments = details.attachments || [];
  lines.push("參考檔案：" + (attachments.length ? attachments.length + " 個" : "未上傳"));
  attachments.forEach(function (file, index) { lines.push((index + 1) + ". " + file.name); });
  if (details.notes !== null) lines.push("", "【特殊需求或想說的話】", details.notes || "未填寫");
  lines.push("", "【預估金額】", Core_.formatPriceRange(estimate.min, estimate.max, estimate.currency),
    "僅為預估，尚未確認正式報價。", "計價明細：");
  estimate.items.forEach(function (item) {
    lines.push("・" + item.label + "：" + Core_.formatPriceRange(item.min, item.max, estimate.currency));
  });
  if (estimate.notes.length) lines.push("報價說明：", estimate.notes.join("\n"));
  if (setting_("ADMIN_URL", true)) lines.push("", "管理後台：" + adminUrl_());
  return lines.join("\n");
}

/** 純文字不解析使用者的 HTML／Markdown；保留完整內容並避免切斷 UTF-16 代理對。 */
function orderNotificationChunks_(order) {
  let remaining = orderNotificationText_(order);
  if (remaining.length <= 4096) return [remaining];
  const chunks = [];
  while (remaining.length) {
    let end = Math.min(3800, remaining.length);
    if (end < remaining.length) {
      const newline = remaining.lastIndexOf("\n", end - 1);
      if (newline >= 0) end = newline + 1;
      else if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end -= 1;
    }
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  return chunks.map(function (text, index) {
    return "委託內容 " + (index + 1) + "/" + chunks.length + "\n編號：" + order.orderId + "\n\n" + text;
  });
}

function sendNotificationText_(recipient, text) {
  return UrlFetchApp.fetch("https://api.telegram.org/bot" + setting_("TELEGRAM_BOT_TOKEN") + "/sendMessage", {
    method: "post", contentType: "application/json", muteHttpExceptions: true, followRedirects: false,
    payload: JSON.stringify({ chat_id: recipient.id, text: text, disable_web_page_preview: true }),
  });
}
