import "../../shared/navigation.js";
import { createApi, integrationConfig } from "../../features/orders/api.js";
import { ORDER_STATUSES } from "../../features/orders/contract.js";
import {
  element,
  renderProgress,
} from "../../features/orders/presentation.js";
import { setupEditor } from "../../features/orders/editor.js";
import { boardColumns } from "../../features/orders/board-view.js";
import { filterBoard } from "../../features/orders/board.js";
import { loadAdminOrders } from "../../features/orders/admin-data.js";

const config = JSON.parse(
  document.querySelector("#commission-data").textContent,
);
const { apiUrl } = integrationConfig();
const api = createApi(apiUrl);
const status = document.querySelector("#admin-status");
const login = document.querySelector("#admin-login");
const loginRetry = document.querySelector("#admin-login-retry");
const loginPanel = document.querySelector("#admin-login-panel");
const logout = document.querySelector("#admin-logout");
const workspace = document.querySelector("#admin-workspace");
const list = document.querySelector("#admin-list");
const refresh = document.querySelector("#admin-refresh");
const search = document.querySelector("#admin-search");
const service = document.querySelector("#admin-service");
const stage = document.querySelector("#admin-stage");
const flag = document.querySelector("#admin-flag");
const summary = document.querySelector("#admin-summary");
const form = document.querySelector("#admin-edit");
const dialog = document.querySelector("#admin-editor-dialog");
const editStatus = document.querySelector("#admin-edit-status");
const discardDialog = document.querySelector("#admin-discard-dialog");
const retry = document.querySelector("#admin-retry");
const editor = setupEditor(form, config);
let token = "";
let orders = [];
let selected = null;
let hasSnapshot = false;
let dirty = false;
let busy = false;
let pendingLogin = null;
let discardAction = null;
let returnOrderId = null;
const storageKey = "lanlan-admin-login-binding";

for (const [value, label] of Object.entries(ORDER_STATUSES)) {
  const option = element("option", label);
  option.value = value;
  stage.append(option);
}

function message(text, focus = false) {
  status.textContent = text;
  if (dialog.open) editStatus.textContent = text;
  if (focus) (dialog.open ? editStatus : status).focus();
}

function closeEditor() {
  if (dialog.open) dialog.close();
  selected = null;
  dirty = false;
}

// 使用頁面內的確認視窗，讓 Escape、繼續編輯與放棄修改走同一個流程。
function afterDiscard(action) {
  if (busy) return;
  if (!dirty) return action();
  discardAction = action;
  discardDialog.showModal();
}

document.querySelector("#admin-close").addEventListener("click", () => afterDiscard(closeEditor));
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  afterDiscard(closeEditor);
});
dialog.addEventListener("close", () => {
  document.body.classList.remove("admin-modal-open");
  const trigger = [...list.querySelectorAll("[data-order-id]")]
    .find((button) => button.dataset.orderId === returnOrderId);
  (workspace.hidden ? login : trigger || list).focus({ preventScroll: true });
});
document.querySelector("#admin-keep-editing").addEventListener("click", () => {
  discardAction = null;
  discardDialog.close();
});
discardDialog.addEventListener("cancel", () => { discardAction = null; });
document.querySelector("#admin-discard").addEventListener("click", () => {
  const action = discardAction;
  discardAction = null;
  dirty = false;
  discardDialog.close();
  action?.();
});

function clearPendingLogin() {
  pendingLogin = null;
  loginRetry.hidden = true;
  sessionStorage.removeItem(storageKey);
}
function clearSession() {
  clearPendingLogin();
  token = "";
  orders = [];
  hasSnapshot = false;
  discardAction = null;
  if (discardDialog.open) discardDialog.close();
  closeEditor();
  list.replaceChildren();
  summary.textContent = "";
  form.reset();
  form.querySelector("#edit-source").replaceChildren();
  form.querySelector("#edit-history").replaceChildren();
  editStatus.textContent = "";
  workspace.hidden = logout.hidden = true;
  loginPanel.hidden = false;
}
function report(error, operation = "load") {
  if (["AUTH", "FORBIDDEN"].includes(error.code)) clearSession();
  const text =
    error.code === "NETWORK"
      ? ({
          login: "登入服務暫時無法連線，請重試 Telegram 登入。",
          exchange: "登入回應中斷，請按「重試完成登入」。若票證已到期，需重新透過 Telegram 登入。",
          load: "暫時無法載入訂單，請按「重新載入」重試。",
          save: "無法確認儲存結果，請重新載入訂單確認，再決定是否修改。",
          notify: "無法確認通知結果，請先重新載入訂單查看通知狀態。",
          logout: "無法確認登出結果，請重試登出；關閉此頁會清除本頁登入資料。",
        }[operation])
      : error.message;
  message(text, true);
}
function selectOrder(order, focus = true) {
  selected = order;
  dirty = false;
  editor.fill(order);
  const opening = !dialog.open;
  if (!dialog.open) {
    returnOrderId = order.orderId;
    editStatus.textContent = "";
    document.body.classList.add("admin-modal-open");
    dialog.showModal();
  }
  if (focus) form.querySelector("h2").focus({ preventScroll: true });
  // showModal 可能還原上次聚焦欄位的捲動位置，開啟後再回到表單頂端。
  if (opening) dialog.querySelector(".dialog-body").scrollTop = 0;
}
function renderList() {
  const result = filterBoard(orders, {
    service: service.value, status: stage.value, flag: flag.value, search: search.value,
  });
  const scrollPositions = new Map([...list.querySelectorAll(".board-column")]
    .map((column) => [column.className, column.querySelector(".column-cards").scrollTop]));
  list.replaceChildren(...boardColumns({
    orders: result.orders,
    counts: hasSnapshot ? result.stageCounts : null,
    stage: stage.value,
    message: busy ? "讀取中……" : "尚未取得委託",
    renderCard(order) {
      const title = order.source?.cardName || order.details.nickname;
      const card = renderProgress({
        ...order, displayTitle: title, sourceArchived: Boolean(order.source?.archived),
      });
      const footer = element("div", undefined, "admin-card-footer");
      const button = element("button", "編輯", "button admin-edit-button");
      button.type = "button";
      button.dataset.orderId = order.orderId;
      button.setAttribute("aria-label", `編輯 ${title}`);
      button.setAttribute("aria-haspopup", "dialog");
      button.disabled = busy;
      button.addEventListener("click", () => {
        if (!busy) selectOrder(order);
      });
      footer.append(element("small", order.orderId), button);
      card.append(footer);
      return card;
    },
  }));
  for (const column of list.querySelectorAll(".board-column")) {
    column.querySelector(".column-cards").scrollTop = scrollPositions.get(column.className) || 0;
  }
  summary.textContent = !hasSnapshot ? "" : result.total
    ? `顯示 ${result.total}／${orders.length} 件委託`
    : `目前沒有符合條件的委託（共 ${orders.length} 件）。`;
}
async function work(task, operation = "load") {
  if (busy) return;
  busy = true;
  const controls = [
    ...workspace.querySelectorAll("button,input,select,textarea"),
    ...dialog.querySelectorAll("button,input,select,textarea"),
    logout,
    login,
    loginRetry,
  ];
  const disabled = new Map(
    controls.map((control) => [control, control.disabled]),
  );
  controls.forEach((control) => {
    control.disabled = true;
  });
  list.setAttribute("aria-busy", "true");
  form.setAttribute("aria-busy", "true");
  try {
    await task();
  } catch (error) {
    report(error, operation);
  } finally {
    busy = false;
    list.setAttribute("aria-busy", "false");
    form.setAttribute("aria-busy", "false");
    disabled.forEach((value, control) => {
      control.disabled = value;
    });
    if (token) {
      renderList();
      retry.disabled = ["sent", "not_required"].includes(selected?.notificationStatus);
    }
  }
}
async function load() {
  message("正在讀取委託看板……");
  renderList();
  const snapshot = await loadAdminOrders(api, token, (loaded, total) => {
    message(`正在讀取委託看板：${loaded}／${total} 件……`);
  });
  orders = snapshot;
  hasSnapshot = true;
  closeEditor();
  renderList();
  message(`已載入全部 ${orders.length} 件委託。`);
}
login.addEventListener("click", () =>
  work(async () => {
    clearPendingLogin();
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const browserKey = [...bytes]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    // 只暫存 OAuth 綁定值；管理工作階段留在記憶體，不放 localStorage 或網址。
    sessionStorage.setItem(storageKey, browserKey);
    status.textContent = "正在準備 Telegram 登入……";
    const result = await api("auth.start", { browserKey });
    const destination = new URL(result.url);
    if (
      destination.origin !== "https://oauth.telegram.org" ||
      destination.pathname !== "/auth"
    ) {
      throw new Error("登入網址不正確，請聯絡維護者。");
    }
    location.assign(destination.href);
  }, "login"),
);
logout.addEventListener("click", () => {
  afterDiscard(() => work(async () => {
    await api("auth.logout", {}, token);
    clearSession();
    status.textContent = "已登出。";
  }, "logout"));
});
refresh.addEventListener("click", () => {
  afterDiscard(() => work(load));
});
search.addEventListener("input", renderList);
for (const filter of [stage, flag, service]) filter.addEventListener("change", () => {
  renderList();
  list.scrollLeft = 0;
});
form.addEventListener("input", () => {
  dirty = true;
});
document.querySelector("#admin-cancel-edit").addEventListener("click", () => {
  if (selected) afterDiscard(() => {
    selectOrder(selected);
    message("已還原未儲存的修改。");
  });
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!selected || busy) return;
  const invalid = [...form.elements].find(
    (control) => control.willValidate && !control.checkValidity(),
  );
  if (invalid) {
    message(`請檢查「${invalid.closest("label")?.firstChild.textContent.trim() || "必填欄位"}」的格式與填寫內容。`);
    invalid.focus();
    return;
  }
  let payload;
  try {
    payload = editor.collect(selected);
  } catch (error) {
    report(error);
    return;
  }
  work(async () => {
    message("正在儲存變更……");
    const order = await api("admin.update", payload, token);
    orders = orders.map((item) =>
      item.orderId === order.orderId ? order : item,
    );
    selectOrder(order, false);
    message("已儲存變更；看板已更新，公開進度會於訪客下次讀取時更新。");
  }, "save");
});
retry.addEventListener("click", () => {
  if (!selected || busy) return;
  if (dirty) {
    message("請先儲存或還原修改，再重試通知。", true);
    return;
  }
  work(async () => {
    message("正在重試 Telegram 通知……");
    const result = await api(
      "admin.retryNotification",
      { orderId: selected.orderId },
      token,
    );
    selected.notificationStatus = result.status;
    selected.notificationAttempts += 1;
    editor.fill(selected);
    message(
      result.status === "sent"
        ? "已傳送 Telegram 通知。"
        : "通知尚未確認成功，請檢查後端設定後再試。",
    );
  }, "notify");
});

async function exchangeLogin() {
  if (!pendingLogin) return;
  status.textContent = "正在完成 Telegram 登入……";
  const session = await api("auth.exchange", pendingLogin);
  token = session.token;
  clearPendingLogin();
  loginPanel.hidden = true;
  workspace.hidden = logout.hidden = false;
  // 登入與清單讀取分開回報；讀取失敗仍保留已建立的登入。
  try { await load(); }
  catch (error) { report(error, "load"); }
}
loginRetry.addEventListener("click", () => work(exchangeLogin, "exchange"));
async function finishLogin() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const ticket = fragment.get("ticket");
  if (!ticket) return;
  history.replaceState(null, "", location.pathname + location.search);
  await work(async () => {
    const browserKey = sessionStorage.getItem(storageKey);
    if (!browserKey) throw new Error("找不到原先登入的分頁，請重新登入。");
    pendingLogin = { ticket, browserKey };
    loginRetry.hidden = false;
    await exchangeLogin();
  }, "exchange");
}
if (!apiUrl) {
  login.disabled = true;
  status.textContent = "管理服務尚未設定，請由維護者完成串接。";
}
finishLogin();
