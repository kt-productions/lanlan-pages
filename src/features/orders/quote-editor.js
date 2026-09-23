import { QUOTE_MAX_AMOUNT, QUOTE_MAX_ITEMS, validateQuote } from "./contract.js";
import { element } from "./presentation.js";
import { formatPriceRange } from "../commission/pricing.js";

/** 手動報價獨立於系統預估，未設定時不把估價下限當成確定金額。 */
export function setupQuoteEditor(form) {
  const enabled = form.elements.quoteEnabled;
  const controls = form.querySelector("#edit-quote-controls");
  const lines = form.querySelector("#edit-quote-lines");
  const total = form.querySelector("#edit-quote-total");
  const add = form.querySelector("#edit-quote-add");
  const amount = form.elements.quoteAmount;
  const estimate = form.querySelector("#edit-estimate-details");
  let imported = false;

  function collect() {
    if (!enabled.checked) return null;
    return validateQuote({
      currency: "TWD",
      amount: amount.value,
      items: imported ? null : [...lines.children].map((row) => ({
        label: row.querySelector(".quote-label").value,
        amount: row.querySelector(".quote-amount").value,
      })),
    }, imported);
  }

  function refresh() {
    controls.hidden = controls.disabled = !enabled.checked;
    amount.disabled = !imported;
    add.disabled = lines.children.length >= QUOTE_MAX_ITEMS;
    [...lines.children].forEach((row, index) => {
      row.querySelector(".quote-label").setAttribute("aria-label", `第 ${index + 1} 筆項目名稱`);
      row.querySelector(".quote-amount").setAttribute("aria-label", `第 ${index + 1} 筆金額`);
      row.querySelector("button").setAttribute("aria-label", `移除第 ${index + 1} 筆明細`);
    });
    try {
      const quote = collect();
      total.textContent = quote ? `訂單總金額：${formatPriceRange(quote.amount, quote.amount, quote.currency)}` : "尚未設定訂單金額";
    } catch {
      total.textContent = "請完成項目名稱與金額，填寫有效金額後會自動加總。";
    }
  }

  function changed() {
    refresh();
    // 新增及移除按鈕沒有原生 input 事件，讓既有未儲存提醒也涵蓋明細異動。
    form.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function append(item = { label: "", amount: "" }) {
    const row = element("div", undefined, "quote-line");
    const nameLabel = element("label", "項目名稱");
    const name = element("input", undefined, "quote-label");
    name.type = "text";
    name.value = item.label;
    name.maxLength = 120;
    name.required = true;
    nameLabel.append(name);
    const priceLabel = element("label", "金額（NT$）");
    const price = element("input", undefined, "quote-amount");
    price.type = "number";
    price.inputMode = "decimal";
    price.step = "0.01";
    price.min = String(-QUOTE_MAX_AMOUNT);
    price.max = String(QUOTE_MAX_AMOUNT);
    price.required = true;
    price.value = item.amount;
    priceLabel.append(price);
    const remove = element("button", "移除", "button quote-remove");
    remove.type = "button";
    remove.addEventListener("click", () => {
      const next = row.nextElementSibling || row.previousElementSibling;
      row.remove();
      changed();
      (next?.querySelector("input") || add).focus();
    });
    row.append(nameLabel, priceLabel, remove);
    lines.append(row);
    return name;
  }

  enabled.addEventListener("change", refresh);
  controls.addEventListener("input", refresh);
  add.addEventListener("click", () => {
    if (lines.children.length >= QUOTE_MAX_ITEMS) return;
    const input = append();
    changed();
    input.focus();
  });

  function fill(order) {
    imported = order.source?.kind === "trello";
    const quote = order.details.quote;
    enabled.checked = Boolean(quote);
    amount.value = imported && quote ? quote.amount : "";
    form.querySelector("#edit-quote-amount-label").hidden = !imported;
    form.querySelector("#edit-quote-item-editor").hidden = imported;
    lines.replaceChildren();
    estimate.hidden = imported;
    estimate.open = !quote;
    const estimateLines = form.querySelector("#edit-estimate-items");
    estimateLines.replaceChildren();
    if (!imported) {
      for (const item of order.details.estimatedPrice.items) {
        const row = element("li");
        row.append(element("span", item.label), element("strong", formatPriceRange(item.min, item.max, order.details.estimatedPrice.currency)));
        estimateLines.append(row);
      }
      const items = quote?.items || order.details.estimatedPrice.items.map((item) => ({
        label: item.label,
        amount: item.min === item.max ? item.min : "",
      }));
      items.forEach(append);
    }
    form.querySelector("#edit-quote-hint").textContent = imported
      ? "Trello 歷史訂單只記錄總金額，不補建原本沒有的計價明細。"
      : "可新增、移除或修改明細，折扣請填負數，總金額自動加總。預估範圍項目須填入確切金額；修改委託內容後，請一併確認此處金額。";
    refresh();
  }

  function clear() {
    enabled.checked = false;
    amount.value = "";
    lines.replaceChildren();
    form.querySelector("#edit-estimate-items").replaceChildren();
    refresh();
  }
  return { fill, collect, clear };
}
