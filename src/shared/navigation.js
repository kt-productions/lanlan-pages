import { pageApi, integrationConfig } from "../features/orders/api.js";
import { createAdminSession } from "../features/orders/admin-session.js";
import { createAdminAccess } from "../features/orders/admin-access.js";

const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("#main-nav");
const adminLinks = [...nav.querySelectorAll("[data-admin-link]")];
// 收益報表共用管理頁的登入與編輯器，以網址保留目前檢視及重新整理行為。
for (const link of adminLinks) {
  const target = new URL(link.href);
  const currentView = new URLSearchParams(location.search).get("view") === "revenue";
  const targetView = target.searchParams.get("view") === "revenue";
  if (target.pathname === location.pathname && currentView === targetView) {
    link.setAttribute("aria-current", "page");
  } else link.removeAttribute("aria-current");
}
const { apiUrl } = integrationConfig();
const savedSession = createAdminSession(apiUrl);
const invalidListeners = new Set();
const adminAccess = createAdminAccess({
  api: pageApi(apiUrl),
  readSession: () => (apiUrl ? savedSession.read() : null),
  clearSession: savedSession.clear,
  onChange(visible) {
    if (!visible && adminLinks.includes(document.activeElement)) {
      nav.querySelector("a:not([hidden])")?.focus();
    }
    adminLinks.forEach((link) => {
      link.hidden = !visible;
    });
  },
  onInvalid(token) {
    invalidListeners.forEach((listener) => listener(token));
  },
});
// 登入兌換及管理 API 成功時已驗證權限，即使瀏覽器禁止保存也能在本頁顯示。
export const confirmAdminNavigation = (session) => adminAccess.confirm(session);
export const clearAdminNavigation = () => adminAccess.clear();
export const onAdminNavigationInvalid = (listener) => invalidListeners.add(listener);
window.addEventListener("storage", (event) => {
  if (event.key === savedSession.key || event.key === null) adminAccess.sync();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) adminAccess.refresh();
});
window.addEventListener("focus", () => adminAccess.refresh());
window.addEventListener("online", () => adminAccess.refresh());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) adminAccess.refresh();
});
adminAccess.sync();
menuToggle.hidden = false;
menuToggle.closest("header").classList.add("has-navigation");

function closeMenu() {
  menuToggle.setAttribute("aria-expanded", "false");
  nav.classList.remove("is-open");
}
menuToggle.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") !== "true";
  menuToggle.setAttribute("aria-expanded", String(open));
  nav.classList.toggle("is-open", open);
});
nav.addEventListener("click", (event) => {
  if (event.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
    closeMenu();
    menuToggle.focus();
  }
});

// 跨過手機斷點時收合選單，避免回到窄螢幕仍保留過期的展開狀態。
matchMedia("(max-width: 760px)").addEventListener("change", closeMenu);
document.addEventListener("click", (event) => {
  if (!menuToggle.closest("header").contains(event.target)) closeMenu();
});

document.querySelector("#year").textContent = new Date().getFullYear();
