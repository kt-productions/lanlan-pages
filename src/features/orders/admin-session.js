/** 只保存登入憑證與伺服器到期時間；依 API 隔離，不保存訂單或 OAuth 綁定值。 */
export function createAdminSession(apiUrl, storage = () => window.localStorage, now = Date.now) {
  const key = `lanlan-admin-session:${apiUrl}`;
  function valid(session) {
    return (
      session?.version === 1 &&
      /^[a-f0-9]{64}$/.test(session.token || "") &&
      Number.isSafeInteger(session.expiresAt) &&
      session.expiresAt > now()
    );
  }
  function clear() {
    try {
      storage().removeItem(key);
      return true;
    } catch {
      return false;
    }
  }
  function read() {
    try {
      const session = JSON.parse(storage().getItem(key) || "null");
      if (valid(session)) return session;
    } catch {
      // 儲存被封鎖或內容損壞時保持未登入，不能阻斷新的 Telegram 驗證。
    }
    clear();
    return null;
  }
  function save(session) {
    const saved = { version: 1, token: session.token, expiresAt: session.expiresAt };
    if (!valid(saved)) return false;
    try {
      storage().setItem(key, JSON.stringify(saved));
      return true;
    } catch {
      clear();
      return false;
    }
  }
  return { key, read, save, clear };
}
