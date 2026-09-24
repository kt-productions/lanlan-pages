export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );

// application/json 仍在 HTML 的 script 元素內，必須阻止資料中的結束標籤提早關閉元素。
export const inlineJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

export function renderTemplate(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(values, key)) throw new Error(`缺少模板欄位 ${key}`);
    return values[key];
  });
}
