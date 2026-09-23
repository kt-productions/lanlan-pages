import { ORDER_STATUSES } from "./contract.js";
import { element, renderProgress } from "./presentation.js";

/** 公開頁與管理頁共用欄位及卡片外觀；管理頁另提供編輯入口。 */
export function boardColumns({
  orders, counts, stage = "", message = "讀取中……", deferredStages = [],
  onLoadDeferred, deferredDisabled = false, renderCard = renderProgress,
}) {
  return Object.entries(ORDER_STATUSES)
    .filter(([key]) => !stage || key === stage)
    .map(([key, name]) => {
      const column = element("section", undefined, `board-column column-${key}`);
      const heading = element("h2", name);
      heading.id = `stage-${key}`;
      column.setAttribute("aria-labelledby", heading.id);
      const cards = orders.filter((order) => order.status === key);
      const count = counts?.[key];
      const deferred = deferredStages.includes(key);
      const badge = element("span", deferred ? "未載入" : count === undefined ? "…" : String(count), "column-count");
      badge.setAttribute("aria-label", deferred ? `${name}尚未載入` : count === undefined ? "件數讀取中" : `${count} 件`);
      const header = element("div", undefined, "column-heading");
      header.append(
        element("span", String(Object.keys(ORDER_STATUSES).indexOf(key) + 1).padStart(2, "0"), "column-step"),
        heading,
        badge,
      );
      const body = element("div", undefined, "column-cards");
      body.tabIndex = 0;
      body.setAttribute("role", "region");
      body.setAttribute("aria-label", `${name}卡片`);
      if (!deferred) body.append(...cards.map(renderCard));
      if (deferred) {
        body.append(element("p", "需要時再載入已交稿委託。", "column-empty"));
        const button = element("button", "載入已交稿", "button");
        button.type = "button";
        button.disabled = deferredDisabled;
        button.addEventListener("click", onLoadDeferred);
        body.append(button);
      }
      else if (count === undefined) body.append(element("p", message, "column-empty"));
      else if (!count) body.append(element("p", "目前沒有委託", "column-empty"));
      else if (cards.length < count) body.append(element("p", `已顯示 ${cards.length}／${count} 件，請載入更多。`, "column-empty"));
      column.append(header, body);
      return column;
    });
}
