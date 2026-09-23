import { createBridge } from "./bridge.js";

const pageClients = new WeakMap();
/** 同頁的導覽與表單／看板共用通訊，避免為身分檢查重建 GAS iframe。 */
export function pageApi(apiUrl, doc = document) {
  if (!pageClients.has(doc)) pageClients.set(doc, new Map());
  const clients = pageClients.get(doc);
  if (!clients.has(apiUrl)) clients.set(apiUrl, createApi(apiUrl));
  return clients.get(apiUrl);
}

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function integrationConfig() {
  return JSON.parse(document.querySelector("#integration-data").textContent);
}

/** 各通道都必須取得可解析的業務回應，不以請求已送出代替操作成功。 */
export function createApi(apiUrl, fetcher = fetch) {
  // 正式 HTTPS 網頁使用 Html Service；命令列與本機預覽仍相容原本的 JSON POST。
  const bridge = typeof window !== "undefined" && window.location.protocol === "https:" &&
    /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(apiUrl)
    ? createBridge(apiUrl) : null;
  return async function request(action, payload = {}, token = "") {
    if (!apiUrl)
      throw new ApiError(
        "NOT_CONFIGURED",
        "服務尚未開放，請先透過頁尾的聯絡方式洽詢。",
      );
    try {
      let result;
      if (bridge) {
        result = await bridge({ action, payload, token });
      } else {
        const response = await fetcher(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=UTF-8" },
          body: JSON.stringify({ action, payload, token }),
          credentials: "omit",
          redirect: "follow",
          signal: AbortSignal.timeout(["orders.upload", "orders.submit", "admin.attachment", "admin.retryNotification"].includes(action) ? 120000 : 45000),
        });
        if (!response.ok) throw new Error("無法讀取回應");
        result = await response.json();
      }
      if (typeof result?.ok !== "boolean") throw new Error("回應格式不正確");
      if (!result.ok)
        throw new ApiError(
          result.error?.code || "SERVER",
          result.error?.message || "服務暫時無法使用。",
        );
      return result.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        "NETWORK",
        "無法確認伺服器回應，請保留此頁後重試。重試同一份內容不會重複建立委託。",
      );
    }
  };
}
