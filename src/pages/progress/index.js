import "../../shared/navigation.js";
import { createApi, integrationConfig } from "../../features/orders/api.js";
import { element } from "../../features/orders/presentation.js";
import { boardColumns } from "../../features/orders/board-view.js";
import { ORDER_STATUSES } from "../../features/orders/contract.js";
import { filterBoard } from "../../features/orders/board.js";

const { apiUrl } = integrationConfig();
const api = createApi(apiUrl);
const list = document.querySelector("#progress-list");
const status = document.querySelector("#progress-status");
const stage = document.querySelector("#progress-stage");
const flag = document.querySelector("#progress-flag");
const service = document.querySelector("#progress-service");
const refresh = document.querySelector("#progress-refresh");
const more = document.querySelector("#progress-more");
for (const [value, label] of Object.entries(ORDER_STATUSES)) {
  const option = element("option", label);
  option.value = value;
  stage.append(option);
}
let orders = [];
let offset = null;
let counts = null;
let busy = false;
let snapshot = null;

function filters() {
  return { status: stage.value, flag: flag.value, service: service.value };
}

function showResult(result) {
  orders = result.orders;
  offset = result.nextOffset;
  counts = result.stageCounts;
  renderBoard();
  status.textContent = result.total
    ? `共 ${result.total} 件委託${offset === null ? "" : `，已顯示 ${orders.length} 件`} · 依照委託順序排列`
    : "目前沒有符合條件的委託，可切換其他類型、階段或附加狀態。";
}

function renderBoard(message = "讀取中……") {
  list.replaceChildren(...boardColumns({ orders, counts, stage: stage.value, message }));
  more.hidden = offset === null;
}

async function load(reset) {
  if (busy) return;
  busy = true;
  const controls = [refresh, more, stage, flag, service];
  controls.forEach((control) => { control.disabled = true; });
  list.setAttribute("aria-busy", "true");
  if (reset) {
    snapshot = null;
    orders = [];
    offset = null;
    counts = null;
    renderBoard();
    list.scrollLeft = 0;
  }
  status.textContent = "正在讀取委託進度……";
  try {
    let result = await api("progress.list", {
      offset: reset ? 0 : offset, limit: 200,
      ...(reset ? {} : filters()),
    });
    if (reset) {
      snapshot = result.nextOffset === null ? result.orders : null;
      if (snapshot) result = filterBoard(snapshot, filters());
      else if (stage.value || flag.value || service.value) {
        result = await api("progress.list", { offset: 0, limit: 200, ...filters() });
      }
    } else result.orders = [...new Map([...orders, ...result.orders].map(order => [order.orderId, order])).values()];
    showResult(result);
  } catch (error) {
    status.textContent = error.code === "NOT_CONFIGURED"
      ? "工作進度尚未開放，繪師啟用後會在這裡公開所有工作。"
      : error.code === "NETWORK"
        ? "暫時無法讀取最新進度，請稍後重新整理。"
        : error.message;
    if (reset) renderBoard("尚未取得進度");
  } finally {
    busy = false;
    controls.forEach((control) => { control.disabled = !apiUrl; });
    list.setAttribute("aria-busy", "false");
  }
}
for (const filter of [stage, flag, service]) filter.addEventListener("change", () => {
  if (snapshot) {
    showResult(filterBoard(snapshot, filters()));
    list.scrollLeft = 0;
  } else load(true);
});
refresh.addEventListener("click", () => load(true));
more.addEventListener("click", () => load(false));
load(true);
