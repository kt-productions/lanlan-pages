import { referenceError } from "./validation.js";
import { ATTACHMENT_MAX_FILES, ATTACHMENT_MAX_TOTAL_BYTES, ATTACHMENT_TYPES } from "../orders/attachment-contract.js";

/** 管理本機預覽的生命週期；切換類型及返回快取頁面時重新驗證。 */
export function setupReference(input, getDetails) {
  const preview = document.querySelector("#reference-preview");
  const info = document.querySelector("#reference-info");
  const link = document.querySelector("#commission-reference-url");
  let urls = [];

  function release() {
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls = [];
    preview.hidden = true;
    preview.replaceChildren();
  }

  function validate() {
    const files = [...input.files];
    input.setCustomValidity(files.length > ATTACHMENT_MAX_FILES ? "最多可上傳 5 個參考檔案。" :
      files.map((file) => referenceError(getDetails(), file)).find(Boolean) ||
      (files.reduce((sum, file) => sum + file.size, 0) > ATTACHMENT_MAX_TOTAL_BYTES ? "參考檔案合計最多 45 MB；較大素材請改用連結。" : "") ||
      (!files.length && !link.value.trim() ? "請上傳至少一個參考檔案，或提供參考素材連結。" : ""));
  }

  function refresh() {
    release();
    const files = [...input.files];
    validate();
    info.textContent = files.length ? `${files.length}／5 個檔案，送出委託時才會上傳。` : "";
    if (files.length && !input.validity.valid) info.textContent += ` ${input.validationMessage}`;
    if (!input.validity.valid) return;
    files.forEach((file) => {
      const item = document.createElement("figure");
      if (ATTACHMENT_TYPES.includes(file.type)) {
        const img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        urls.push(img.src);
        img.alt = `${file.name} 預覽`;
        img.addEventListener("error", () => { img.hidden = true; });
        item.append(img);
      }
      const caption = document.createElement("figcaption");
      caption.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
      item.append(caption);
      preview.append(item);
    });
    preview.hidden = !files.length;
  }

  input.addEventListener("change", refresh);
  link.addEventListener("input", validate);
  window.addEventListener("pagehide", release);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) refresh();
  });
  return { validate, refresh };
}
