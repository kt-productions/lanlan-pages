/** 空白通訊頁只轉送既有 API；管理操作仍由 callApi 內的 requireAdmin_ 驗證。 */
function bridgePage_(channel) {
  Core_.requireValue(/^[a-f0-9]{64}$/.test(channel), "服務連線識別不正確。");
  const origin = adminUrl_().match(/^https:\/\/[^/]+/)[0];
  const literal = function (value) {
    return JSON.stringify(value).replace(/</g, "\\u003c");
  };
  const script = `
    (function () {
      const channel = ${literal(channel)};
      const origin = ${literal(origin)};
      if (window.top === window) return;
      window.addEventListener("message", function (event) {
        const message = event.data;
        if (event.source !== window.top || event.origin !== origin ||
            !message || message.channel !== channel || message.type !== "lanlan:request" ||
            typeof message.id !== "string" || !/^[a-f0-9-]{36}$/.test(message.id) ||
            typeof message.request !== "string" || message.request.length > ${Core_.API_MAX_REQUEST_CHARS}) return;
        const reply = function (result) {
          window.top.postMessage({type:"lanlan:response",channel:channel,id:message.id,result:result}, origin);
        };
        google.script.run.withSuccessHandler(reply).withFailureHandler(function () {
          reply(JSON.stringify({ok:false,error:{code:"NETWORK",message:"無法確認伺服器回應，請重試。"}}));
        }).callApi(message.request);
      });
      window.top.postMessage({type:"lanlan:ready",channel:channel}, origin);
    })();
  `;
  // 此頁沒有登入表單或管理內容；只允許設定的網站來源、分頁識別與上層視窗通訊。
  return HtmlService.createHtmlOutput(
    '<!doctype html><html><head><meta name="referrer" content="no-referrer">' +
      '<title>委託服務連線</title></head><body><script>' + script + '</script></body></html>',
  ).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
