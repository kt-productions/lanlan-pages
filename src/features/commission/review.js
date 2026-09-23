import { formatPriceRange } from "./pricing.js";
import { populateDescription } from "../../shared/dom.js";

const paymentNames = { bank: "轉帳／匯款", paypal: "PayPal" };
const contactNames = {
  telegram: "Telegram",
  facebook: "Facebook",
  discord: "Discord",
};

export function estimateLabel(estimate) {
  return estimate.empty
    ? "請先選擇貼圖"
    : formatPriceRange(estimate.min, estimate.max, estimate.currency);
}
export function renderReview(config, snapshot) {
  const { service } = snapshot;
  const rows = [
    ["委託類型", config.services[service].name],
    ["暱稱", snapshot.nickname],
    [
      "聯絡方式",
      contactNames[snapshot.contact.channel] + " · " + snapshot.contact.value,
    ],
    ["參考素材連結", snapshot.referenceUrl || "尚未填寫"],
    [
      "參考檔案",
      snapshot.references.length
        ? snapshot.references.map((file) => file.name).join("\n") + "\n（送出時上傳）"
        : "未選擇",
    ],
  ];
  if (service === "stickers")
    rows.push([
      "貼圖款式",
      snapshot.stickerIds.map((id) => "No." + id).join("、"),
    ]);
  if (service === "chibi")
    rows.push([
      "委託方案",
      snapshot.chibiPlan === "animated" ? "插圖＋動畫" : "插圖",
    ]);
  if (snapshot.characterCount !== null)
    rows.push(["角色人數", snapshot.characterCount === 2 ? "雙人" : "單人"]);
  if (snapshot.transition !== null)
    rows.push(["循環動畫加購轉場", snapshot.transition ? "加購" : "不加購"]);
  if (snapshot.commercial !== null)
    rows.push(["商業用途", snapshot.commercial ? "是" : "否"]);
  if (snapshot.background !== null)
    rows.push(["背景與特效", snapshot.background ? "需要" : "單色／無背景"]);
  if (snapshot.rush !== null)
    rows.push(["急件", snapshot.rush ? "是，需討論" : "否"]);
  rows.push(["付款方式", paymentNames[snapshot.payment]]);
  if (snapshot.allowLivestream !== null)
    rows.push(["可在直播繪製", snapshot.allowLivestream ? "是" : "否"]);
  rows.push(["可作作品範例", snapshot.allowPortfolio ? "是" : "否"]);
  if (snapshot.notes) rows.push(["特殊需求", snapshot.notes]);
  rows.push(["預估金額", estimateLabel(snapshot.estimatedPrice)]);
  rows.push([
    "計價明細",
    snapshot.estimatedPrice.items
      .map((item) => item.label + "：" + formatPriceRange(item.min, item.max, snapshot.estimatedPrice.currency))
      .join("\n"),
  ]);
  rows.push(["報價說明", snapshot.estimatedPrice.notes.join("\n")]);
  populateDescription("#commission-review", rows);
  document.querySelector("#download-status").textContent = "";
}
