import "../../shared/navigation.js";
import { pageApi, integrationConfig } from "../../features/orders/api.js";
import { boardColumns } from "../../features/orders/board-view.js";
import { filterBoard } from "../../features/orders/board.js";
import { loadBoardOrders, mergeDeliveredOrders } from "../../features/orders/board-data.js";

const { apiUrl } = integrationConfig();
const api = pageApi(apiUrl);
const list = document.querySelector("#progress-list");
const status = document.querySelector("#progress-status");
const flag = document.querySelector("#progress-flag");
const service = document.querySelector("#progress-service");
const refresh = document.querySelector("#progress-refresh");
let orders = [];
let busy = false;
let hasSnapshot = false;
let deliveredLoaded = false;

function renderBoard(message = "尚未取得進度") {
  const result = filterBoard(orders, {
    flag: flag.value, service: service.value,
  });
  list.replaceChildren(...boardColumns({
    orders: result.orders, counts: hasSnapshot ? result.stageCounts : null,
    message,
    deferredStages: deliveredLoaded ? [] : ["delivered"],
    onLoadDeferred: () => load(true),
    deferredDisabled: busy || !hasSnapshot || !apiUrl,
  }));
  if (!hasSnapshot) return;
  status.textContent = result.total
    ? `共 ${result.total} 件${deliveredLoaded ? "" : "未交稿"}委託 · 依照委託順序排列`
    : "目前沒有符合條件的委託，可切換其他類型或附加狀態";
  if (!deliveredLoaded) status.textContent += "；已交稿尚未載入。";
}

async function load(includeDelivered = false) {
  if (busy) return;
  busy = true;
  const controls = [refresh, flag, service, ...list.querySelectorAll("button")];
  controls.forEach((control) => { control.disabled = true; });
  list.setAttribute("aria-busy", "true");
  const label = includeDelivered ? "已交稿" : "未交稿";
  if (!hasSnapshot) renderBoard("讀取中……");
  status.textContent = `正在讀取${label}委託……`;
  try {
    const snapshot = await loadBoardOrders(api, {
      delivery: includeDelivered ? "delivered" : "active",
      onProgress(loaded, total) {
        status.textContent = `正在讀取${label}委託：${loaded}／${total} 件……`;
      },
    });
    orders = includeDelivered ? mergeDeliveredOrders(orders, snapshot) : snapshot;
    deliveredLoaded = includeDelivered;
    hasSnapshot = true;
    renderBoard();
    if (!includeDelivered) list.scrollLeft = 0;
  } catch (error) {
    if (!hasSnapshot) renderBoard();
    status.textContent = error.code === "NOT_CONFIGURED"
      ? "工作進度尚未開放，繪師啟用後會在這裡公開工作。"
      : error.code === "NETWORK"
        ? "暫時無法讀取最新進度，請稍後重試。"
        : error.message;
  } finally {
    busy = false;
    controls.forEach((control) => { control.disabled = !apiUrl; });
    const loadButton = list.querySelector(".column-delivered button");
    if (loadButton) loadButton.disabled = !hasSnapshot || !apiUrl;
    list.setAttribute("aria-busy", "false");
    if (includeDelivered) {
      const target = loadButton || list.querySelector(".column-delivered .column-cards");
      target?.focus({ preventScroll: true });
    }
  }
}
for (const filter of [flag, service]) filter.addEventListener("change", () => {
  renderBoard();
  list.scrollLeft = 0;
});
refresh.addEventListener("click", () => load());
load();
