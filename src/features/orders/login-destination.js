/** 只接受本站作品管理；彈出視窗受阻而回到固定 OAuth 回程時，仍可還原目的頁。 */
export function createLoginDestination(search, storage = () => window.sessionStorage) {
  const key = "lanlan-admin-login-destination";
  const requested = new URLSearchParams(search).get("return") === "artworks";
  function clear() {
    try { storage().removeItem(key); }
    catch { /* 禁止保存時仍可使用目前網址的目的頁。 */ }
  }
  function remember() {
    clear();
    if (requested) {
      try { storage().setItem(key, "artworks"); }
      catch { /* 彈出視窗登入仍保留目前網址。 */ }
    }
  }
  function take() {
    let returnToArtworks = requested;
    try { returnToArtworks ||= storage().getItem(key) === "artworks"; }
    catch { /* 不讀取其他來源作為轉址目標。 */ }
    clear();
    return returnToArtworks ? "../artworks/" : null;
  }
  return { remember, take, clear };
}
