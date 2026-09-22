import "../../shared/navigation.js";
import { createApi, integrationConfig } from "../../features/orders/api.js";
import { renderProgress, element } from "../../features/orders/presentation.js";
import { ORDER_STATUSES } from "../../features/orders/contract.js";

const { apiUrl } = integrationConfig();
const api = createApi(apiUrl);
const list = document.querySelector("#progress-list");
const status = document.querySelector("#progress-status");
const stage = document.querySelector("#progress-stage");
const flag = document.querySelector("#progress-flag");
const refresh = document.querySelector("#progress-refresh");
const more = document.querySelector("#progress-more");
const stages = document.querySelector("#workflow-stages");
for (const [value, label] of Object.entries(ORDER_STATUSES)) {
  stages.append(element("li", label));
  const option = element("option", label);
  option.value = value;
  stage.append(option);
}
let orders = [];
let offset = null;
let total = 0;
let busy = false;

function render() {
  list.replaceChildren(...orders.map(renderProgress));
  status.textContent = orders.length
    ? `已顯示 ${orders.length}／${total} 筆工作，依收件時間由早到晚排列。`
    : stage.value || flag.value
      ? "目前沒有符合條件的工作，可切換為所有階段與所有工作。"
      : "目前還沒有工作進度，收到委託後會在這裡更新。";
  more.hidden = offset === null;
}
async function load(reset) {
  if (busy) return;
  busy = true;
  refresh.disabled = more.disabled = stage.disabled = flag.disabled = true;
  list.setAttribute("aria-busy", "true");
  if (reset) {
    orders = [];
    offset = null;
    list.replaceChildren();
    more.hidden = true;
  }
  status.textContent = "正在讀取委託進度……";
  try {
    const result = await api("progress.list", {
      offset: reset ? 0 : offset,
      status: stage.value,
      flag: flag.value,
    });
    orders = reset ? result.orders : [...orders, ...result.orders];
    orders = [
      ...new Map(orders.map((order) => [order.orderId, order])).values(),
    ];
    offset = result.nextOffset;
    total = result.total;
    render();
  } catch (error) {
    status.textContent =
      error.code === "NOT_CONFIGURED"
        ? "工作進度尚未開放，繪師啟用後會在這裡公開所有工作。"
        : error.code === "NETWORK"
        ? "暫時無法讀取最新進度，請稍後重新整理。"
        : error.message;
  } finally {
    busy = false;
    refresh.disabled = more.disabled = stage.disabled = flag.disabled = !apiUrl;
    list.setAttribute("aria-busy", "false");
  }
}
stage.addEventListener("change", () => load(true));
flag.addEventListener("change", () => load(true));
refresh.addEventListener("click", () => load(true));
more.addEventListener("click", () => load(false));
load(true);
