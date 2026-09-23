/** 導覽只依伺服器確認的管理工作階段顯示；較晚返回的驗證不可恢復已登出的入口。 */
export function createAdminAccess({ api, readSession, clearSession, onChange, onInvalid = () => {},
  now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
  let active = null;
  let generation = 0;
  let timer;
  let pending;
  const valid = (session) => session && /^[a-f0-9]{64}$/.test(session.token || "") &&
    Number.isSafeInteger(session.expiresAt) && session.expiresAt > now();

  function replace(session, verified = false) {
    generation += 1;
    cancel(timer);
    active = valid(session) ? { token: session.token, expiresAt: session.expiresAt } : null;
    onChange(Boolean(active && verified));
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
    replace({ ...session, expiresAt }, true);
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
        // 暫時無法驗證時維持隱藏，保留憑證供回到頁面或網路恢復時重試。
      } finally {
        if (pending?.generation === revision) pending = null;
      }
    })();
    pending = { generation: revision, promise };
    return promise;
  }
  return { refresh, confirm, clear: () => replace(null), sync: () => refresh(readSession()) };
}
