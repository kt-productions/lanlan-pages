import { referenceError } from "./validation.js";

/** 管理本機預覽的生命週期；切換類型及返回快取頁面時重新驗證。 */
export function setupReference(input, getDetails) {
  const preview = document.querySelector("#reference-preview");
  const info = document.querySelector("#reference-info");
  let objectUrl = null;

  function release() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
    preview.hidden = true;
    preview.removeAttribute("src");
  }

  function validate() {
    input.setCustomValidity(
      !input.required && !input.files[0]
        ? ""
        : referenceError(getDetails(), input.files[0]),
    );
  }

  function refresh() {
    release();
    const file = input.files[0];
    validate();
    info.textContent = file
      ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB（留在本機）`
      : "";
    if (file && !input.validity.valid)
      info.textContent += `；${input.validationMessage}`;
    if (
      file &&
      input.validity.valid &&
      /^image\/(png|jpeg|gif|webp|avif)$/.test(file.type)
    ) {
      objectUrl = URL.createObjectURL(file);
      preview.src = objectUrl;
      preview.hidden = false;
    }
  }

  input.addEventListener("change", refresh);
  preview.addEventListener("error", () => {
    if (!objectUrl) return;
    release();
    info.textContent += "；此檔案無法顯示圖片預覽。";
  });
  window.addEventListener("pagehide", release);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) refresh();
  });
  return { validate, refresh };
}
