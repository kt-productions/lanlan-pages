import { confirmAdminNavigation, clearAdminNavigation, onAdminNavigationInvalid } from "../../shared/navigation.js";
import { ApiError, pageApi, integrationConfig } from "../../features/orders/api.js";
import { ORDER_STATUSES } from "../../features/orders/contract.js";
import { renderProgress } from "../../features/orders/presentation.js";
import { setupEditor } from "../../features/orders/editor.js";
import { boardColumns } from "../../features/orders/board-view.js";
import { filterBoard } from "../../features/orders/board.js";
import { loadBoardOrders, mergeDeliveredOrders } from "../../features/orders/board-data.js";
import { setupAttachments } from "../../features/orders/attachments-view.js";
import { createLoginPopup } from "../../features/orders/login-popup.js";
import { createAdminSession } from "../../features/orders/admin-session.js";
import { setupBoardDrag, statusUpdate } from "../../features/orders/board-drag.js";

const config = JSON.parse(
  document.querySelector("#commission-data").textContent,
);
const { apiUrl } = integrationConfig();
const request = pageApi(apiUrl);
const savedSession = createAdminSession(apiUrl);
async function api(action, payload, requestToken) {
  try {
    const result = await request(action, payload, requestToken);
    // 其他分頁登出或等待期間到期後，不讓較晚返回的回應重新顯示管理資料。
    if (requestToken && requestToken !== token) {
      throw new ApiError("SESSION_CHANGED", "登入已結束，請重新登入。");
    }
    if (requestToken && action.startsWith("admin.")) {
      confirmAdminNavigation({ token: requestToken, expiresAt: sessionExpiresAt });
    }
    return result;
  } catch (error) {
    if (requestToken && requestToken !== token) {
      throw new ApiError("SESSION_CHANGED", "登入已結束，請重新登入。");
    }
    throw error;
  }
}
const status = document.querySelector("#admin-status");
const login = document.querySelector("#admin-login");
const loginRetry = document.querySelector("#admin-login-retry");
const loginCancel = document.querySelector("#admin-login-cancel");
const loginPanel = document.querySelector("#admin-login-panel");
const logout = document.querySelector("#admin-logout");
const workspace = document.querySelector("#admin-workspace");
const list = document.querySelector("#admin-list");
const refresh = document.querySelector("#admin-refresh");
const search = document.querySelector("#admin-search");
const service = document.querySelector("#admin-service");
const flag = document.querySelector("#admin-flag");
const summary = document.querySelector("#admin-summary");
const form = document.querySelector("#admin-edit");
const dialog = document.querySelector("#admin-editor-dialog");
const editStatus = document.querySelector("#admin-edit-status");
const discardDialog = document.querySelector("#admin-discard-dialog");
const retry = document.querySelector("#admin-retry");
const editor = setupEditor(form, config);
let token = "";
let sessionExpiresAt = 0;
let sessionTimer;
let orders = [];
let selected = null;
let hasSnapshot = false;
let deliveredLoaded = false;
let dirty = false;
let busy = false;
let movementBlocked = false;
let pendingLogin = null;
let discardAction = null;
let returnOrderId = null;
const storageKey = "lanlan-admin-login-binding";
const attachments = setupAttachments(document.querySelector("#edit-attachments"), api, () => token, report);
const popupLogin = createLoginPopup(api, {
  onWaiting() {
    message("請在 Telegram 視窗完成驗證，此頁會自動登入。");
    loginCancel.hidden = false;
  },
  onTicket(payload) {
    loginCancel.hidden = true;
    pendingLogin = payload;
    loginRetry.hidden = false;
    work(exchangeLogin, "exchange");
  },
  onError(error) {
    clearPendingLogin();
    login.disabled = !apiUrl;
    report(error, "login");
  },
});

const drag = setupBoardDrag(list, {
  canDrag: () => Boolean(token) && hasSnapshot && !busy && !movementBlocked && !dialog.open,
  onMove: moveOrder,
});

function message(text, focus = false) {
  status.textContent = text;
  if (dialog.open) editStatus.textContent = text;
  if (focus) (dialog.open ? editStatus : status).focus();
}

function closeEditor() {
  attachments.clear();
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
    .find((card) => card.dataset.orderId === returnOrderId);
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
  popupLogin.cancel();
  loginCancel.hidden = true;
  pendingLogin = null;
  loginRetry.hidden = true;
  sessionStorage.removeItem(storageKey);
}
function clearSession(removeSaved = true) {
  clearAdminNavigation();
  drag.reset();
  if (removeSaved) savedSession.clear();
  clearTimeout(sessionTimer);
  sessionExpiresAt = 0;
  clearPendingLogin();
  token = "";
  orders = [];
  hasSnapshot = false;
  deliveredLoaded = false;
  discardAction = null;
  if (discardDialog.open) discardDialog.close();
  closeEditor();
  list.replaceChildren();
  summary.textContent = "";
  form.reset();
  editor.clear();
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
          logout: "已停止保存此瀏覽器的登入，但無法確認伺服器登出結果，請再按「登出」重試。",
        }[operation])
      : error.message;
  message(text, true);
}
function selectOrder(order, focus = true) {
  selected = order;
  dirty = false;
  editor.fill(order);
  attachments.show(order);
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
    service: service.value, flag: flag.value, search: search.value,
  });
  const scrollPositions = new Map([...list.querySelectorAll(".board-column")]
    .map((column) => [column.className, column.querySelector(".column-cards").scrollTop]));
  list.replaceChildren(...boardColumns({
    orders: result.orders,
    counts: hasSnapshot ? result.stageCounts : null,
    deferredStages: deliveredLoaded ? [] : ["delivered"],
    onLoadDeferred: loadDelivered,
    deferredDisabled: busy || !hasSnapshot,
    message: busy ? "讀取中……" : "尚未取得委託",
    renderCard(order) {
      const title = order.source?.cardName || order.details.nickname || "未命名委託";
      const card = renderProgress({ ...order, displayTitle: title });
      card.dataset.dragOrderId = order.orderId;
      card.draggable = !busy && !movementBlocked;
      card.dataset.orderId = order.orderId;
      card.tabIndex = busy ? -1 : 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `編輯 ${title}`);
      card.setAttribute("aria-haspopup", "dialog");
      card.setAttribute("aria-disabled", String(busy));
      card.addEventListener("click", () => {
        if (!busy && !dialog.open) selectOrder(order);
      });
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (!event.repeat && !busy && !dialog.open) selectOrder(order);
      });
      return card;
    },
  }));
  for (const column of list.querySelectorAll(".board-column")) {
    column.querySelector(".column-cards").scrollTop = scrollPositions.get(column.className) || 0;
  }
  const scopeTotal = filterBoard(orders, { flag: flag.value === "archived" ? "archived" : "" }).total;
  const scopeLabel = `${flag.value === "archived" ? "封存" : "未封存"}${deliveredLoaded ? "" : "、未交稿"}委託`;
  summary.textContent = !hasSnapshot ? "" : result.total
    ? `顯示 ${result.total}／${scopeTotal} 件${scopeLabel}`
    : `目前沒有符合條件的委託（共 ${scopeTotal} 件${scopeLabel}）`;
  if (hasSnapshot && !deliveredLoaded) {
    summary.textContent += "；搜尋與篩選暫不含已交稿。";
  }
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
  for (const card of list.querySelectorAll("[data-order-id]")) {
    card.setAttribute("aria-disabled", "true");
    card.tabIndex = -1;
    card.draggable = false;
  }
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
    login.disabled = !apiUrl || popupLogin.active();
    if (token) {
      renderList();
      retry.disabled = ["sent", "not_required"].includes(selected?.notificationStatus);
    }
  }
}
async function load(includeDelivered = false) {
  const label = includeDelivered ? "已交稿" : "未交稿";
  message(`正在讀取${label}委託……`);
  renderList();
  const snapshot = await loadBoardOrders(api, {
    admin: true, token, delivery: includeDelivered ? "delivered" : "active",
    onProgress(loaded, total) {
      message(`正在讀取${label}委託：${loaded}／${total} 件……`);
    },
  });
  orders = includeDelivered ? mergeDeliveredOrders(orders, snapshot) : snapshot;
  if (!includeDelivered) movementBlocked = false;
  deliveredLoaded = includeDelivered;
  hasSnapshot = true;
  closeEditor();
  renderList();
  message(`已載入 ${snapshot.length} 件${label}委託。${includeDelivered ? "" : "已交稿可按需載入。"}`);
}
login.addEventListener("click", () =>
  work(async () => {
    clearPendingLogin();
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const browserKey = [...bytes]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    // OAuth 綁定值只暫存在原分頁，與登入完成後保存的工作階段分開。
    sessionStorage.setItem(storageKey, browserKey);
    status.textContent = "正在準備 Telegram 登入……";
    await popupLogin.start(browserKey);
  }, "login"),
);
loginCancel.addEventListener("click", () => {
  clearPendingLogin();
  login.disabled = !apiUrl;
  message("已取消登入，可以重新透過 Telegram 登入。");
});
window.addEventListener("pagehide", () => popupLogin.cancel());
window.addEventListener("storage", (event) => {
  if (event.key !== savedSession.key && event.key !== null) return;
  if (token && savedSession.read()?.token !== token) {
    clearSession(false);
    message("登入狀態已在其他分頁變更，請重新整理或登入。");
  }
});
window.addEventListener("pageshow", checkSessionExpiry);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkSessionExpiry();
});
logout.addEventListener("click", () => {
  afterDiscard(() => work(async () => {
    clearAdminNavigation();
    savedSession.clear();
    await api("auth.logout", {}, token);
    clearSession();
    status.textContent = "已登出。";
  }, "logout"));
});
refresh.addEventListener("click", () => {
  afterDiscard(() => work(load));
});
function loadDelivered() {
  afterDiscard(async () => {
    await work(() => load(true));
    if (token) {
      const target = list.querySelector(".column-delivered .column-cards > button") ||
        list.querySelector(".column-delivered .column-cards");
      target?.focus({ preventScroll: true });
    }
  });
}
search.addEventListener("input", renderList);
for (const filter of [flag, service]) filter.addEventListener("change", () => {
  renderList();
  list.scrollLeft = 0;
});
async function moveOrder(orderId, nextStatus) {
  const current = orders.find((order) => order.orderId === orderId);
  if (!current || busy || movementBlocked || dialog.open || current.status === nextStatus) return;
  await work(async () => {
    message(`正在移至「${ORDER_STATUSES[nextStatus]}」……`);
    try {
      const order = await api("admin.update", statusUpdate(current, nextStatus), token);
      orders = orders.map((item) => item.orderId === order.orderId ? order : item);
      if (!deliveredLoaded && order.status === "delivered") {
        orders = orders.filter((item) => item.orderId !== order.orderId);
        message("已移至「已交稿」；可按「載入已交稿」查看或繼續編輯。");
      } else {
        message(`已移至「${ORDER_STATUSES[order.status]}」；卡片仍依建立時間由舊到新排列。`);
      }
    } catch (error) {
      // 回應不明或版本衝突後，先取得最新資料才允許再次拖曳，避免連續誤改。
      if (["NETWORK", "CONFLICT"].includes(error.code)) movementBlocked = true;
      throw error;
    }
  }, "save");
}
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
    if (!deliveredLoaded && order.status === "delivered") {
      orders = orders.filter((item) => item.orderId !== order.orderId);
      closeEditor();
      message("已儲存為已交稿；可按「載入已交稿」查看或繼續編輯。");
    } else if (order.isArchived !== (flag.value === "archived")) {
      closeEditor();
      message(order.isArchived
        ? "已封存；可從附加狀態選擇「封存」查看或解除封存。"
        : "已解除封存；可從附加狀態選擇「所有工作」查看。");
    } else {
      selectOrder(order, false);
      message("已儲存變更；看板已更新，公開進度會於訪客下次讀取時更新。");
    }
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
  const persisted = savedSession.save(session);
  clearPendingLogin();
  activateSession(session);
  confirmAdminNavigation(session);
  // 登入與清單讀取分開回報；讀取失敗仍保留已建立的登入。
  try { await load(); }
  catch (error) { report(error, "load"); }
  if (!persisted && token) message(`${status.textContent} 瀏覽器無法保存登入，關閉或重新整理後需再登入。`);
}
function activateSession(session) {
  token = session.token;
  sessionExpiresAt = session.expiresAt;
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(checkSessionExpiry, Math.max(0, sessionExpiresAt - Date.now()));
  loginPanel.hidden = true;
  workspace.hidden = logout.hidden = false;
}
function checkSessionExpiry() {
  if (token && sessionExpiresAt <= Date.now()) {
    clearSession();
    message("登入已滿 3 天或已到期，請重新透過 Telegram 登入。");
  }
}
loginRetry.addEventListener("click", () => work(exchangeLogin, "exchange"));
async function finishLogin() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const ticket = fragment.get("ticket");
  if (!ticket) {
    const session = apiUrl && savedSession.read();
    if (session) {
      activateSession(session);
      await work(load);
    }
    return;
  }
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
onAdminNavigationInvalid((invalidToken) => {
  if (token === invalidToken) {
    clearSession();
    message("登入已失效或管理權限已移除，請重新登入。");
  }
});
finishLogin();
