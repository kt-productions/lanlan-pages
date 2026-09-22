export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function integrationConfig() {
  return JSON.parse(document.querySelector("#integration-data").textContent);
}

/** 使用簡單 POST，讓 Apps Script 的重新導向可被瀏覽器讀取；不使用 no-cors 假裝送件成功。 */
export function createApi(apiUrl, fetcher = fetch) {
  return async function request(action, payload = {}, token = "") {
    if (!apiUrl)
      throw new ApiError(
        "NOT_CONFIGURED",
        "服務尚未開放，請先透過頁尾的聯絡方式洽詢。",
      );
    try {
      const response = await fetcher(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify({ action, payload, token }),
        credentials: "omit",
        redirect: "follow",
        signal: AbortSignal.timeout(45000),
      });
      if (!response.ok) throw new Error("無法讀取回應");
      const result = await response.json();
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
