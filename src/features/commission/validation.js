import { attachmentFileError } from "../orders/attachment-contract.js";

/** @param {{size: number, type: string}|undefined} file */
export function referenceError(details, file) {
  if (!file) return "請選擇角色設定檔。";
  return attachmentFileError(file, details.referenceAccept === "image/*");
}

export function contactError(channel, value) {
  const text = value.trim();
  if (!text) return "請填寫聯絡方式。";
  if (channel !== "facebook") return "";
  try {
    const url = new URL(text);
    if (url.protocol === "https:" && /(^|\.)facebook\.com$|^fb\.me$/.test(url.hostname)) return "";
  } catch {
    // 無法解析與網域不符使用相同提示，不把使用者輸入寫入日誌。
  }
  return "請提供有效的 Facebook 個人頁面 HTTPS 連結。";
}

/** 必填提示由本站提供繁中用語，不依賴作業系統的瀏覽器語言。 */
export function fieldError(control) {
  if (control.validity.customError) return control.validationMessage;
  if (control.validity.valueMissing) {
    const messages = {
      chibiPlan: "請選擇委託方案。",
      characterCount: "請選擇角色人數。",
      transition: "請選擇是否加購轉場。",
      commercial: "請選擇是否作為商業用途。",
      background: "請選擇是否需要背景與特效。",
      rush: "請選擇是否為急件。",
      payment: "請選擇付款方式。",
      contactChannel: "請選擇聯絡平台。",
      allowLivestream: "請選擇是否同意直播繪製。",
      allowPortfolio: "請選擇是否同意用作作品範例。",
    };
    return control.id === "commission-read"
      ? "請閱讀並勾選這個類型的委託說明與製作流程。"
      : messages[control.name] || "請完成這個必填欄位。";
  }
  if (control.validity.tooLong) return `請將內容縮短至 ${control.maxLength} 字元以內。`;
  return "請檢查這個欄位的格式。";
}
