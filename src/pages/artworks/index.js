import { confirmAdminNavigation, clearAdminNavigation, onAdminNavigationInvalid } from "../../shared/navigation.js";
import { ApiError, pageApi, integrationConfig } from "../../features/orders/api.js";
import { createAdminSession } from "../../features/orders/admin-session.js";
import { setupArtworkAdmin } from "../../features/artworks/admin.js";

const { apiUrl } = integrationConfig();
const request = pageApi(apiUrl);
const savedSession = createAdminSession(apiUrl);
const loginPanel = document.querySelector("#artwork-login-panel");
const logout = document.querySelector("#artwork-logout");
const status = document.querySelector("#artwork-session-status");
let token = "";
let sessionExpiresAt = 0;
let sessionTimer;

async function api(action, payload, requestToken) {
  try {
    const result = await request(action, payload, requestToken);
    // 登出或跨分頁切換登入後，晚到的回應不能重新顯示作品資料。
    if (requestToken !== token) throw new ApiError("SESSION_CHANGED", "登入已結束，請重新登入。");
    if (action.startsWith("admin.")) {
      confirmAdminNavigation({ token: requestToken, expiresAt: sessionExpiresAt });
    }
    return result;
  } catch (error) {
    if (requestToken !== token) throw new ApiError("SESSION_CHANGED", "登入已結束，請重新登入。");
    throw error;
  }
}

const artworks = setupArtworkAdmin({ api, getToken: () => token, report });

function message(text) {
  status.textContent = text;
  status.focus();
}

function clearSession(removeSaved = true) {
  token = "";
  sessionExpiresAt = 0;
  clearTimeout(sessionTimer);
  if (removeSaved) savedSession.clear();
  clearAdminNavigation();
  artworks.clear();
  logout.hidden = true;
  loginPanel.hidden = false;
}

function report(error) {
  if (["AUTH", "FORBIDDEN"].includes(error.code)) clearSession();
  message(error.message || "暫時無法載入作品，請按「更新狀態」重試。");
}

function checkSessionExpiry() {
  if (token && sessionExpiresAt <= Date.now()) {
    clearSession();
    message("登入已滿 3 天或已到期，請重新透過 Telegram 登入。");
  }
}

logout.addEventListener("click", async () => {
  logout.disabled = true;
  const previousToken = token;
  clearSession();
  try {
    await request("auth.logout", {}, previousToken);
    message("已登出。");
  } catch {
    message("已清除此瀏覽器的登入。伺服器登出結果尚未確認，原登入會依期限失效。");
  } finally {
    logout.disabled = false;
  }
});

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
onAdminNavigationInvalid((invalidToken) => {
  if (token === invalidToken) {
    clearSession();
    message("登入已失效或管理權限已移除，請重新登入。");
  }
});

const session = apiUrl && savedSession.read();
if (session) {
  token = session.token;
  sessionExpiresAt = session.expiresAt;
  sessionTimer = setTimeout(checkSessionExpiry, Math.max(0, sessionExpiresAt - Date.now()));
  loginPanel.hidden = true;
  logout.hidden = false;
  artworks.activate();
} else if (!apiUrl) {
  document.querySelector("#artwork-login").hidden = true;
  status.textContent = "管理服務尚未設定，請由維護者完成串接。";
}
