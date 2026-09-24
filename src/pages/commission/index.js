import "../../shared/navigation.js";
import { populateList } from "../../shared/dom.js";
import { estimateCommission, formatPriceRange } from "../../features/commission/pricing.js";
import { selectionFromData, createDraft } from "../../features/commission/draft.js";
import { contactError, fieldError } from "../../features/commission/validation.js";
import { setupReference } from "../../features/commission/reference.js";
import { setupStickers } from "../../features/commission/stickers.js";
import { renderEstimate } from "../../features/commission/estimate.js";
import { renderReview } from "../../features/commission/review.js";
import { setupSubmission } from "../../features/commission/submission.js";
import { httpsReference } from "../../features/orders/contract.js";

const config = JSON.parse(document.querySelector("#commission-data").textContent);
const app = document.querySelector("#commission-app");
const form = document.querySelector("#commission-form");
const steps = [...form.querySelectorAll("[data-form-step]")];
const progress = [...document.querySelectorAll(".form-steps li")];
const errorBox = document.querySelector("#commission-error");
const back = document.querySelector("#commission-back");
const next = document.querySelector("#commission-next");
const download = document.querySelector("#commission-download");
const reference = document.querySelector("#commission-reference");
const contact = document.querySelector("#commission-contact");
const channel = document.querySelector("#commission-channel");
const nickname = document.querySelector("#commission-nickname");
let service = "animation";
let step = 0;
let snapshot = null;
const submission = setupSubmission(app, form, () => snapshot, showError, clearError);
const referenceUrl = document.querySelector("#commission-reference-url");
referenceUrl.addEventListener("input", () => referenceUrl.setCustomValidity(""));

const stickers = setupStickers(config, form, updateEstimate);
const referencePreview = setupReference(reference, () => config.services[service]);

function updateEstimate() {
  const selection = selectionFromData(service, new FormData(form));
  renderEstimate(config, service, selection, estimateCommission(config, selection));
  stickers.updateSummary();
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  errorBox.focus({ preventScroll: true });
}
function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
  for (const control of form.querySelectorAll('[aria-invalid="true"]')) {
    control.removeAttribute("aria-invalid");
    const descriptions = (control.getAttribute("aria-describedby") || "")
      .split(" ")
      .filter((id) => id !== errorBox.id);
    if (descriptions.length) control.setAttribute("aria-describedby", descriptions.join(" "));
    else control.removeAttribute("aria-describedby");
  }
}
function showStep(target, focus = true) {
  step = target;
  steps.forEach((panel, index) => {
    panel.hidden = index !== target;
  });
  progress.forEach((item, index) => {
    if (index === target) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
    item.classList.toggle("is-complete", index < target);
  });
  back.hidden = target === 0;
  next.hidden = target === 2;
  download.hidden = target !== 2;
  submission.showStep(target);
  next.firstChild.textContent = target === 0 ? "下一步 " : "檢查填寫內容 ";
  clearError();
  if (focus) {
    const heading = steps[target].querySelector(".form-step-title");
    heading.focus({ preventScroll: true });
    document.querySelector(".form-steps").scrollIntoView({ block: "start", behavior: "auto" });
  }
}
form.addEventListener("change", (event) => {
  if (
    [
      "stickerIds",
      "chibiPlan",
      "characterCount",
      "transition",
      "commercial",
      "background",
      "rush",
      "payment",
    ].includes(event.target.name)
  )
    updateEstimate();
});
function applyService() {
  const details = config.services[service];
  document.querySelector("#commission-description").textContent =
    config.serviceDescriptions[service];
  document.querySelector("#commission-service-name").textContent = details.name;
  populateList("#commission-rules", details.rules);
  populateList("#commission-workflow", details.workflow);
  document.querySelector("#preparation-motion").hidden = service === "stickers";
  for (const group of form.querySelectorAll("[data-service-fields]")) {
    const active = group.dataset.serviceFields.split(" ").includes(service);
    group.hidden = !active;
    // 停用不適用控制，才能同時排除原生驗證、FormData 與計價。
    if (group.tagName === "FIELDSET") group.disabled = !active;
    else
      group.querySelectorAll("input,textarea,select").forEach((input) => {
        input.disabled = !active;
      });
  }
  reference.accept = details.referenceAccept;
  document.querySelector("#reference-label-hint").textContent =
    service === "stickers" ? "一份表單限同一角色，若有多個角色請分開填寫" : "最多 5 個";
  document.querySelector("#reference-hint").textContent =
    service === "stickers"
      ? "最多 5 個圖片，單檔 10 MB、合計 45 MB（PNG、JPEG、GIF、WebP、AVIF）。送出委託時會一併上傳。"
      : "最多 5 個檔案，單檔 10 MB、合計 45 MB。送出委託時會一併上傳；較大檔案可改用下方素材連結。";
  document.querySelector("#commercial-hint").textContent =
    service === "stickers"
      ? "先扣除數量與款式折扣，再將折扣後總價 ×" + details.pricing.commercialMultiplier + "。"
      : service === "animation"
        ? "商業用途加收 " +
          formatPriceRange(details.pricing.commercial, undefined, details.pricing.currency) +
          "。"
        : "";
  if (service !== "stickers") {
    document.querySelector("#second-character-label").textContent =
      service === "animation"
        ? `雙人（+${formatPriceRange(details.pricing.secondCharacter, undefined, details.pricing.currency)}）`
        : `雙人（+${details.pricing.secondCharacterPercent}%）`;
    document.querySelector("#character-count-hint").textContent =
      service === "animation"
        ? "最多雙人，第二角色的複雜費另外計算。"
        : "最多雙人；第二角色加收所選方案原價的 " +
          details.pricing.secondCharacterPercent +
          "%，不包含複雜費或加急費。";
  }
  const rush = details.pricing.rush;
  document.querySelector("#rush-hint").textContent = rush
    ? "急件加收 " +
      formatPriceRange(rush.min, rush.max, details.pricing.currency) +
      "，需先聯絡確認是否能安排。"
    : "";
  const paypalRate = details.pricing.paypalPercent;
  const paypalPercent =
    paypalRate.min === paypalRate.max ? paypalRate.min : `${paypalRate.min}–${paypalRate.max}`;
  document.querySelector("#payment-hint").textContent =
    `PayPal 按加減價後的小計加收 ${paypalPercent}% 手續費。`;
  document.querySelector("#commission-read").checked = false;
  // 切換類型後沿用檔案，但立即重套 MIME 與大小限制，避免顯示過期的有效預覽。
  referencePreview.refresh();
  // 類型變更使原確認內容失效；保留可共用輸入，但重新要求閱讀確認。
  snapshot = null;
  document.querySelector("#download-status").textContent = "";
  showStep(0, false);
  updateEstimate();
}
document.querySelectorAll('[name="commission-service"]').forEach((input) => {
  input.addEventListener("change", () => {
    service = input.value;
    applyService();
  });
});

function updateContactHint() {
  const messages = {
    telegram: "請填寫 Telegram ID，例如 @yourname；也可填寫 t.me 個人連結。",
    facebook: "請貼上 Facebook 個人頁面連結，例如 https://www.facebook.com/yourname。",
    discord: "請填寫 Discord 的英文使用者 ID，不是暱稱喔！",
  };
  document.querySelector("#contact-hint").textContent =
    messages[channel.value] || "請填寫可聯絡到你的帳號或個人頁面連結。";
  contact.placeholder =
    channel.value === "facebook"
      ? "https://www.facebook.com/…"
      : channel.value === "telegram"
        ? "@你的帳號"
        : "你的使用者 ID，是英文 ID，不是暱稱喔！";
  contact.setCustomValidity("");
}
channel.addEventListener("change", updateContactHint);
contact.addEventListener("input", () => contact.setCustomValidity(""));
nickname.addEventListener("input", () => nickname.setCustomValidity(""));
form.addEventListener("input", clearError);
function validateStep() {
  clearError();
  if (step === 0 && service === "stickers" && stickers.selected().length === 0) {
    showError("請至少選擇一款貼圖。");
    return false;
  }
  if (step === 1) {
    referenceUrl.setCustomValidity("");
    if (referenceUrl.value.trim() || referenceUrl.required) {
      try {
        httpsReference(referenceUrl.value);
      } catch (error) {
        referenceUrl.setCustomValidity(error.message);
      }
    }
    nickname.setCustomValidity(nickname.value.trim() ? "" : "請填寫你的暱稱。");
    contact.setCustomValidity(contactError(channel.value, contact.value));
    referencePreview.validate();
  }
  const invalid = [...steps[step].querySelectorAll("input,select,textarea")].find(
    (input) => input.willValidate && !input.checkValidity(),
  );
  if (invalid) {
    showError(fieldError(invalid));
    invalid.setAttribute("aria-invalid", "true");
    invalid.setAttribute(
      "aria-describedby",
      [invalid.getAttribute("aria-describedby"), errorBox.id].filter(Boolean).join(" "),
    );
    invalid.focus();
    return false;
  }
  return true;
}
function advance() {
  if (step >= 2 || !validateStep()) return;
  if (step === 1) {
    snapshot = createDraft(
      config,
      service,
      new FormData(form),
      [...reference.files],
      document.querySelector("#commission-read").checked,
    );
    renderReview(config, snapshot);
  }
  showStep(step + 1);
}
next.addEventListener("click", advance);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  advance();
});
back.addEventListener("click", () => showStep(Math.max(0, step - 1)));
download.addEventListener("click", () => {
  if (!snapshot) return;
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "lanlan-commission-preview.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  document.querySelector("#download-status").textContent =
    "已產生本機草稿。下載不會送出委託；送件結果請以此頁收件訊息為準。";
});
app.hidden = false;
document.querySelector("#mobile-estimate").hidden = false;
applyService();
updateContactHint();
