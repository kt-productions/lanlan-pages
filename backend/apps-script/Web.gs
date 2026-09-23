function apiResult_(task) {
  let result;
  try {
    result = { ok: true, data: task() };
  } catch (error) {
    result = {
      ok: false,
      error: {
        code: error instanceof Core_.OrderError ? error.code : "SERVER",
        message:
          error instanceof Core_.OrderError
            ? error.message
            : "服務暫時無法完成操作，請稍後重試。",
      },
    };
  }
  return JSON.stringify(result);
}

function doPost(event) {
  return ContentService.createTextOutput(
    callApi(event && event.postData && event.postData.contents),
  ).setMimeType(ContentService.MimeType.JSON);
}

/** Html Service 與舊 POST 共用同一個入口，不能繞過身分、長度或欄位驗證。 */
function callApi(text) {
  return apiResult_(function () {
    Core_.requireValue(
      typeof text === "string" && text.length <= Core_.API_MAX_REQUEST_CHARS,
      "請求內容過大或格式不正確。",
    );
    let request;
    try {
      request = JSON.parse(text);
    } catch (error) {
      throw new Core_.OrderError("VALIDATION", "請求格式不正確。");
    }
    Core_.requireValue(
      request && typeof request === "object",
      "請求格式不正確。",
    );
    const payload = request.payload || {};
    Core_.requireValue(request.action === "orders.upload" || text.length <= 40000, "請求內容過大。");
    switch (request.action) {
      case "orders.upload":
        return uploadOrderReference_(payload);
      case "orders.submit":
        return submitOrder_(payload);
      case "progress.list":
        return pageOrders_(payload, false);
      case "auth.start":
        return beginLogin_(payload);
      case "auth.exchange":
        return exchangeTicket_(payload);
      case "auth.poll":
        return pollLogin_(payload);
      default: {
        const actor = requireAdmin_(request.token);
        switch (request.action) {
          case "admin.list":
            return pageOrders_(payload, true);
          case "admin.update":
            return updateOrder_(payload, actor);
          case "admin.attachment":
            return adminReference_(payload);
          case "admin.retryNotification":
            return notifyOrder_(payload.orderId, true);
          case "auth.logout":
            CacheService.getScriptCache().remove(
              "session:" + digest_(request.token),
            );
            return { loggedOut: true };
          default:
            throw new Core_.OrderError("NOT_FOUND", "不支援這個操作。");
        }
      }
    }
  });
}

function escapeHtml_(text) {
  return String(text).replace(/[&<>"']/g, function (character) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[character];
  });
}

function doGet(event) {
  const params = (event && event.parameter) || {};
  if (params.bridge) return bridgePage_(params.bridge);
  let title = "委託服務";
  let body = "請從網站開啟委託表單或管理後台。";
  let closePopup = false;
  if (params.state) {
    try {
      const result = completeLogin_(params);
      closePopup = result.popup;
      title = "Telegram 驗證完成";
      body =
        (closePopup ? '原管理頁會自動完成登入，此視窗將自動關閉。若仍停留在此頁，可關閉視窗或' : '') +
        '<a target="_top" rel="noreferrer" href="' +
        escapeHtml_(result.destination) +
        '">返回管理後台</a>';
    } catch (error) {
      title = "無法登入";
      body = escapeHtml_(
        error instanceof Core_.OrderError
          ? error.message
          : "登入未完成，請返回管理頁重試。",
      );
    }
  }
  return HtmlService.createHtmlOutput(
    '<!doctype html><html lang="zh-Hant-TW"><head><base target="_top">' +
      '<meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      "<title>" +
      title +
      "</title><style>body{font:18px/1.8 system-ui;background:#fffdf4;color:#46301f;max-width:38rem;margin:15vh auto;padding:24px}a{color:#765039}</style>" +
      "</head><body><h1>" +
      title +
      "</h1><p>" +
      body +
      "</p>" +
      (closePopup ? '<script>setTimeout(function(){try{window.top.close();}catch(error){document.getElementById("close-hint").hidden=false;}},250);</script><p id="close-hint" hidden>請回到原本的管理頁，登入會自動完成。</p>' : '') +
      "</body></html>",
  );
}
