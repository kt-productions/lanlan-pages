/** 保留原管理頁，驗證結果由已綁定 browserKey 的 API 取得，避免 GAS 頂層轉址限制。 */
export function createLoginPopup(api, {
  host = window, onWaiting = () => {}, onTicket, onError,
}) {
  let attempt = null;

  function cancel() {
    const current = attempt;
    attempt = null;
    if (!current) return;
    host.clearTimeout(current.timer);
    // 跨來源頁可能已自行關閉視窗；關閉失敗不影響原管理頁交換已驗證的票證。
    try { current.popup?.close(); }
    catch { return false; }
    return true;
  }

  async function poll(current) {
    if (attempt !== current) return;
    try {
      const result = await api("auth.poll", { browserKey: current.browserKey });
      if (attempt !== current) return;
      current.failures = 0;
      if (/^[a-f0-9]{64}$/.test(result.ticket || "")) {
        cancel();
        onTicket({ ticket: result.ticket, browserKey: current.browserKey });
        return;
      }
      if (result.pending !== true) throw new Error("登入回應不正確，請重新登入。");
      current.timer = host.setTimeout(() => poll(current), 2000);
    } catch (error) {
      if (attempt !== current) return;
      if (error.code === "NETWORK" && ++current.failures < 3) {
        current.timer = host.setTimeout(() => poll(current), 3000);
        return;
      }
      cancel();
      onError(error);
    }
  }

  async function start(browserKey) {
    cancel();
    // 必須在使用者點擊時、第一個 await 之前開啟，避免被瀏覽器當成非預期彈出視窗。
    const current = { browserKey, popup: host.open("about:blank", "_blank", "popup,width=520,height=720"),
      timer: null, failures: 0 };
    attempt = current;
    try {
      if (current.popup) current.popup.opener = null;
      const result = await api("auth.start", { browserKey, popup: Boolean(current.popup) });
      if (attempt !== current) return;
      const destination = new URL(result.url);
      if (destination.origin !== "https://oauth.telegram.org" || destination.pathname !== "/auth") {
        throw new Error("登入網址不正確，請聯絡維護者。");
      }
      if (!current.popup) {
        attempt = null;
        host.location.assign(destination.href);
        return;
      }
      current.popup.location.replace(destination.href);
      onWaiting();
      current.timer = host.setTimeout(() => poll(current), 1500);
    } catch (error) {
      if (attempt === current) cancel();
      throw error;
    }
  }

  return { start, cancel, active: () => attempt !== null };
}
