/** 先用未到期的登入紀錄顯示入口，再於背景驗證；管理資料仍由 API 獨立授權。 */
export function createAdminAccess({ api, readSession, clearSession, onChange, onInvalid = () => {},
  now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
  let active = null;
  let generation = 0;
  let timer;
  let pending;
  const valid = (session) => session && /^[a-f0-9]{64}$/.test(session.token || "") &&
    Number.isSafeInteger(session.expiresAt) && session.expiresAt > now();

  function replace(session) {
    generation += 1;
    cancel(timer);
    active = valid(session) ? { token: session.token, expiresAt: session.expiresAt } : null;
    onChange(Boolean(active));
    if (active) {
      const current = active;
      timer = schedule(() => invalidate(current), Math.max(0, active.expiresAt - now()));
    }
  }

  function invalidate(session) {
    replace(null);
    // 跨分頁切換帳號時，舊請求不能清掉較新的登入。
    if (readSession()?.token === session.token) clearSession();
    onInvalid(session.token);
  }

  function confirm(session) {
    const expiresAt = active?.token === session.token
      ? Math.min(active.expiresAt, session.expiresAt) : session.expiresAt;
    replace({ ...session, expiresAt });
  }

  function refresh(session = active || readSession()) {
    if (pending?.generation === generation && active?.token === session?.token) return pending.promise;
    replace(session);
    if (!active) return Promise.resolve();
    const current = active;
    const revision = generation;
    const promise = (async () => {
      try {
        const result = await api("auth.session", {}, current.token);
        if (revision !== generation) return;
        if (result?.authenticated !== true || !Number.isSafeInteger(result.expiresAt)) return;
        if (result.expiresAt <= now()) return invalidate(current);
        confirm({ token: current.token, expiresAt: Math.min(current.expiresAt, result.expiresAt) });
      } catch (error) {
        if (revision !== generation) return;
        if (["AUTH", "FORBIDDEN"].includes(error.code)) invalidate(current);
        // 網路中斷不讓入口閃爍；原期限仍有效，到期或明確拒絕才清除。
      } finally {
        if (pending?.generation === revision) pending = null;
      }
    })();
    pending = { generation: revision, promise };
    return promise;
  }
  return { refresh, confirm, clear: () => replace(null), sync: () => refresh(readSession()) };
}
