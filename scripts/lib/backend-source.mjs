/** 共用模組嵌入 GAS 時移除宣告；支援多行具名匯入，不依賴原始碼排版。 */
export function backendSource(source) {
  const body = source
    .replace(/^import\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?\r?\n/gm, "")
    .replace(/^export (?=(?:const|let|function|class)\b)/gm, "");
  // 此打包器只處理目前共用的宣告形式，遇到新模組形式要先擴充，不能發布半成品。
  if (/^(?:import|export)\b/m.test(body)) {
    throw new Error("後端共用模組包含尚未支援的 import／export 宣告。");
  }
  return body;
}
