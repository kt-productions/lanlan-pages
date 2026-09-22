import "../../shared/navigation.js";
import { createApi, integrationConfig } from "../../features/orders/api.js";
import { ORDER_STATUSES } from "../../features/orders/contract.js";
import {
  element,
  serviceNames,
  renderFlags,
} from "../../features/orders/presentation.js";
import { setupEditor } from "../../features/orders/editor.js";

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
const more = document.querySelector("#admin-more");
const refresh = document.querySelector("#admin-refresh");
const search = document.querySelector("#admin-search");
const form = document.querySelector("#admin-edit");
const empty = document.querySelector("#admin-empty");
const retry = document.querySelector("#admin-retry");
const editor = setupEditor(form, config);
let token = "";
let orders = [];
let selected = null;
let offset = null;
let dirty = false;
let busy = false;
let pendingLogin = null;
const storageKey = "lanlan-admin-login-binding";

function clearPendingLogin() {
  pendingLogin = null;
  loginRetry.hidden = true;
  sessionStorage.removeItem(storageKey);
}
function clearSession() {
  clearPendingLogin();
  token = "";
  orders = [];
  selected = null;
  dirty = false;
  list.replaceChildren();
  form.reset();
  form.hidden = true;
  workspace.hidden = logout.hidden = true;
  loginPanel.hidden = false;
}
function report(error, operation = "load") {
  if (["AUTH", "FORBIDDEN"].includes(error.code)) clearSession();
  status.textContent =
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
  status.focus();
}
function canDiscard() {
  return (
    !dirty || window.confirm("目前有尚未儲存的修改，確定要離開這筆編輯嗎？")
  );
}
function selectOrder(order, focus = true) {
  selected = order;
  dirty = false;
  empty.hidden = true;
  editor.fill(order);
  renderList();
  if (focus) form.querySelector("h2").focus();
}
function renderList() {
  const needle = search.value.trim().toLowerCase();
  const shown = orders.filter((order) =>
    `${order.orderId} ${order.details.nickname}`.toLowerCase().includes(needle),
  );
  list.replaceChildren(
    ...shown.map((order) => {
      const button = element("button", undefined, "admin-order");
      button.type = "button";
      button.setAttribute(
        "aria-pressed",
        String(order.orderId === selected?.orderId),
      );
      button.append(
        element("strong", order.orderId),
        element(
          "span",
          `${order.details.nickname} · ${serviceNames[order.service]}`,
        ),
        element("span", ORDER_STATUSES[order.status]),
        renderFlags(order),
      );
      button.disabled = busy;
      button.addEventListener("click", () => {
        if (!busy && canDiscard()) selectOrder(order);
      });
      return button;
    }),
  );
  if (!shown.length) list.append(element("p", "目前沒有符合的委託。"));
  more.hidden = offset === null;
}
async function work(task, operation = "load") {
  if (busy) return;
  busy = true;
  const controls = [
    ...workspace.querySelectorAll("button,input,select,textarea"),
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
  try {
    await task();
  } catch (error) {
    report(error, operation);
  } finally {
    busy = false;
    disabled.forEach((value, control) => {
      control.disabled = value;
    });
    if (token) {
      renderList();
      retry.disabled = ["sent", "not_required"].includes(selected?.notificationStatus);
    }
  }
}
async function load(reset) {
  const response = await api(
    "admin.list",
    { offset: reset ? 0 : offset },
    token,
  );
  orders = reset ? response.orders : [...orders, ...response.orders];
  orders = [...new Map(orders.map((order) => [order.orderId, order])).values()];
  offset = response.nextOffset;
  if (reset) {
    form.hidden = true;
    empty.hidden = false;
    selected = null;
    dirty = false;
  }
  renderList();
  status.textContent = `已載入 ${orders.length} 筆委託。`;
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
  if (!canDiscard()) return;
  work(async () => {
    await api("auth.logout", {}, token);
    clearSession();
    status.textContent = "已登出。";
  }, "logout");
});
refresh.addEventListener("click", () => {
  if (canDiscard()) work(() => load(true));
});
more.addEventListener("click", () => work(() => load(false)));
search.addEventListener("input", renderList);
form.addEventListener("input", () => {
  dirty = true;
});
document.querySelector("#admin-cancel-edit").addEventListener("click", () => {
  if (selected && canDiscard()) {
    selectOrder(selected);
    status.textContent = "已還原未儲存的修改。";
  }
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!selected || busy) return;
  const invalid = [...form.elements].find(
    (control) => control.willValidate && !control.checkValidity(),
  );
  if (invalid) {
    status.textContent = `請檢查「${invalid.closest("label")?.firstChild.textContent.trim() || "必填欄位"}」的格式與填寫內容。`;
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
    status.textContent = "正在儲存變更……";
    const order = await api("admin.update", payload, token);
    orders = orders.map((item) =>
      item.orderId === order.orderId ? order : item,
    );
    selectOrder(order, false);
    status.textContent = "已儲存變更；公開進度會於訪客下次讀取時更新。";
  }, "save");
});
retry.addEventListener("click", () => {
  if (!selected || busy) return;
  if (dirty) {
    status.textContent = "請先儲存或還原修改，再重試通知。";
    return;
  }
  work(async () => {
    status.textContent = "正在重試 Telegram 通知……";
    const result = await api(
      "admin.retryNotification",
      { orderId: selected.orderId },
      token,
    );
    selected.notificationStatus = result.status;
    selected.notificationAttempts += 1;
    editor.fill(selected);
    status.textContent =
      result.status === "sent"
        ? "已傳送 Telegram 通知。"
        : "通知尚未確認成功，請檢查後端設定後再試。";
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
  try { await load(true); }
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
