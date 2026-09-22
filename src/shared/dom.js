/** 以純文字建立清單，避免把表單輸入或內容設定解讀為 HTML。 */
export function populateList(selector, lines) {
  document.querySelector(selector).replaceChildren(
    ...lines.map((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      return item;
    }),
  );
}

export function populateDescription(selector, rows) {
  document.querySelector(selector).replaceChildren(
    ...rows.flatMap(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      return [term, description];
    }),
  );
}
