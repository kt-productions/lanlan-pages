/** 只接受固定的本站管理目的地；彈出視窗受阻而回到 OAuth 回程時，仍可還原。 */
export function createLoginDestination(search, storage = () => window.sessionStorage) {
  const key = "lanlan-admin-login-destination";
  const destinations = new Map([
    ["artworks", "../artworks/"],
    ["revenue", "../admin/?view=revenue"],
  ]);
  const query = new URLSearchParams(search);
  const requested = query.get("return");
  const current = query.get("view") === "revenue" ? "revenue" : null;
  function clear() {
    try {
      storage().removeItem(key);
    } catch {
      /* 禁止保存時仍可使用目前網址的目的頁。 */
    }
  }
  function remember() {
    clear();
    const destination = destinations.has(requested) ? requested : current;
    if (destination) {
      try {
        storage().setItem(key, destination);
      } catch {
        /* 彈出視窗登入仍保留目前網址。 */
      }
    }
  }
  function take() {
    let destination = destinations.has(requested) ? requested : null;
    try {
      destination ||= storage().getItem(key);
    } catch {
      /* 不讀取其他來源作為轉址目標。 */
    }
    clear();
    // 已在收益檢視時直接完成登入，避免回到同一網址後再次轉址。
    return destination === current ? null : destinations.get(destination) || null;
  }
  return { remember, take, clear };
}
