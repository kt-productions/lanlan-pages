const ORDER_HEADERS_ = [
  "orderId",
  "requestId",
  "requestHash",
  "createdAt",
  "updatedAt",
  "revision",
  "status",
  "progress",
  "publicVisible",
  "publicNote",
  "service",
  "nickname",
  "contactChannel",
  "contactValue",
  "referenceUrl",
  "notes",
  "adminNote",
  "estimateMin",
  "estimateMax",
  "currency",
  "detailsJson",
  "notificationStatus",
  "notificationAttempts",
  "notificationError",
  "notificationAt",
  "lastEditor",
  "historyJson",
  "isRush",
  "isOnHold",
  "notificationRecipientsJson",
  "sourceJson",
  "isArchived",
];

function orderSheet_() {
  const sheet = SpreadsheetApp.openById(
    setting_("SPREADSHEET_ID"),
  ).getSheetByName("Orders");
  Core_.requireValue(sheet, "訂單工作表尚未初始化。", "CONFIG");
  Core_.requireValue(
    sheet.getMaxColumns() >= ORDER_HEADERS_.length,
    "訂單欄數不足，請由維護者執行 setupOrders 更新表頭。",
    "CONFIG",
  );
  const header = sheet.getRange(1, 1, 1, ORDER_HEADERS_.length).getValues()[0];
  Core_.requireValue(
    JSON.stringify(header) === JSON.stringify(ORDER_HEADERS_),
    "訂單欄位不符，請由維護者檢查並執行 setupOrders 更新表頭。",
    "CONFIG",
  );
  return sheet;
}

/**
 * 編輯器不列出底線結尾的函式，因此提供可選取的初始化入口。
 * HtmlService 也能呼叫公開函式，必須拒絕匿名訪客或代他人執行的請求。
 */
function setupOrders() {
  const activeEmail = Session.getActiveUser().getEmail();
  const effectiveEmail = Session.getEffectiveUser().getEmail();
  Core_.requireValue(
    activeEmail && activeEmail === effectiveEmail,
    "請由專案編輯者從 Apps Script 編輯器執行初始化。",
    "FORBIDDEN",
  );
  setupOrders_();
}

/** 保留既有訂單；27／29／30／31 欄舊表只在新增欄位完全空白時追加表頭。 */
function setupOrders_() {
  lock_(function () {
    const book = SpreadsheetApp.openById(setting_("SPREADSHEET_ID"));
    let sheet = book.getSheetByName("Orders");
    if (!sheet) sheet = book.insertSheet("Orders");
    if (sheet.getLastRow() === 0) {
      ensureOrderColumns_(sheet);
      sheet
        .getRange(1, 1, 1, ORDER_HEADERS_.length)
        .setValues([ORDER_HEADERS_]);
      sheet.setFrozenRows(1);
    } else {
      const width = Math.min(sheet.getMaxColumns(), ORDER_HEADERS_.length);
      const header = sheet.getRange(1, 1, 1, width).getValues()[0];
      if (JSON.stringify(header) !== JSON.stringify(ORDER_HEADERS_)) {
        const oldWidth = [31, 30, 29, 27].find(function (count) {
          return JSON.stringify(header.slice(0, count)) ===
            JSON.stringify(ORDER_HEADERS_.slice(0, count));
        });
        Core_.requireValue(
          Boolean(oldWidth),
          "訂單欄位不符，請停止操作並檢查工作表版本。",
          "CONFIG",
        );
        const tail = width > oldWidth
          ? sheet.getRange(1, oldWidth + 1, sheet.getLastRow(), width - oldWidth)
          : null;
        Core_.requireValue(
          !tail || (tail.getValues().every(function (row) {
            return row.every(function (value) { return value === ""; });
          }) && tail.getFormulas().every(function (row) {
            return row.every(function (value) { return value === ""; });
          })),
          "新增欄位已有內容，請停止操作，不可覆寫。",
          "CONFIG",
        );
        ensureOrderColumns_(sheet);
        sheet.getRange(1, oldWidth + 1, 1, ORDER_HEADERS_.length - oldWidth)
          .setValues([ORDER_HEADERS_.slice(oldWidth)]);
      }
    }
    orderSheet_();
  });
}

function ensureOrderColumns_(sheet) {
  const width = sheet.getMaxColumns();
  if (width < ORDER_HEADERS_.length) {
    sheet.insertColumnsAfter(width, ORDER_HEADERS_.length - width);
  }
}

function readOrders_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, ORDER_HEADERS_.length)
    .getValues()
    .map(function (values, index) {
      const order = { row: index + 2 };
      ORDER_HEADERS_.forEach(function (key, position) {
        order[key] = values[position];
      });
      return order;
    });
}

function orderValues_(order) {
  return ORDER_HEADERS_.map(function (key) {
    const value = order[key] === undefined ? "" : order[key];
    Core_.requireValue(
      typeof value !== "string" || value.length <= 45000,
      "訂單紀錄已達欄位容量，請聯絡維護者。",
      "CAPACITY",
    );
    // setValues 會把等號開頭的字串當成公式。前置單引號讓使用者文字保留為純文字。
    return typeof value === "string" && /^[=+@\-\t\r]/.test(value)
      ? "'" + value
      : value;
  });
}

function writeOrder_(sheet, order) {
  const values = orderValues_(order);
  sheet
    .getRange(order.row || sheet.getLastRow() + 1, 1, 1, ORDER_HEADERS_.length)
    .setValues([values]);
  SpreadsheetApp.flush();
}

function findOrder_(sheet, id) {
  const order = readOrders_(sheet).find(function (item) {
    return item.orderId === id;
  });
  Core_.requireValue(order, "找不到這筆委託。", "NOT_FOUND");
  return order;
}

function detailColumns_(details) {
  return {
    service: details.service,
    nickname: details.nickname,
    contactChannel: details.contact ? details.contact.channel : "",
    contactValue: details.contact ? details.contact.value : "",
    referenceUrl: details.referenceUrl || "",
    notes: details.notes || "",
    estimateMin: details.estimatedPrice ? details.estimatedPrice.min : "",
    estimateMax: details.estimatedPrice ? details.estimatedPrice.max : "",
    currency: details.estimatedPrice ? details.estimatedPrice.currency || "" : "",
    detailsJson: JSON.stringify(details),
  };
}

function receipt_(order) {
  return {
    orderId: order.orderId,
    createdAt: order.createdAt,
    status: Core_.orderWorkflow(order).status,
    estimatedPrice: JSON.parse(order.detailsJson).estimatedPrice,
  };
}

function submitOrder_(payload) {
  const input = submissionInput_(payload);
  const details = input.details;
  const requestHash = input.hash;
  const result = lock_(function () {
    const sheet = orderSheet_();
    const orders = readOrders_(sheet);
    const existing = orders.find(function (order) {
      return order.requestId === payload.requestId;
    });
    if (existing) {
      Core_.requireValue(
        existing.requestHash === requestHash,
        "同一送件識別碼的內容不同，請保留原內容重試。",
        "CONFLICT",
      );
      return { order: existing, created: false };
    }
    checkSubmissionCapacity_(orders, details, payload.requestId);
    if (input.manifest.length) details.attachments = completedReferences_(payload.requestId, input);
    const now = new Date().toISOString();
    const order = Object.assign(detailColumns_(details), {
      orderId:
        "LL-" +
        Utilities.getUuid().replace(/-/g, "").slice(0, 16).toUpperCase(),
      requestId: payload.requestId,
      requestHash: requestHash,
      createdAt: now,
      updatedAt: now,
      revision: 1,
      status: "queued",
      progress: 0,
      publicVisible: true,
      isRush: details.rush === true,
      isOnHold: false,
      isArchived: false,
      publicNote: "",
      adminNote: "",
      lastEditor: "customer",
      notificationStatus: "pending",
      notificationAttempts: 0,
      notificationError: "",
      notificationAt: "",
      notificationRecipientsJson: "",
      historyJson: JSON.stringify([
        { at: now, actor: "customer", action: "created", revision: 1 },
      ]),
    });
    writeOrder_(sheet, order);
    return { order: order, created: true };
  });
  // Sheet 回執寫入成功後才釋放上傳預留；重試已成立的訂單也可清掉遺留預留。
  if (input.manifest.length) PropertiesService.getScriptProperties().deleteProperty("REFERENCE_UPLOAD_" + payload.requestId);
  // 訂單已提交後，通知失敗也不得回滾訂單或向前端回報收件失敗。
  if (result.created) {
    try {
      notifyOrder_(result.order.orderId, false);
    } catch (error) {
      /* pending 可由後台重試，不記錄含憑證的例外。 */
    }
  }
  return receipt_(result.order);
}

function pageOrders_(payload, admin) {
  // 舊版呼叫端省略此欄時保留原回應；新版看板明確要求未交稿或已交稿。
  const delivery = payload.delivery === undefined ? "all" : payload.delivery;
  Core_.requireValue(["all", "active", "delivered"].includes(delivery),
    "交稿範圍不正確。");
  const offset = payload.offset === undefined ? 0 : payload.offset;
  const limit = admin || payload.limit === undefined ? 30 : payload.limit;
  Core_.requireValue(Number.isInteger(limit) && limit >= 1 && limit <= 200,
    "每頁筆數不正確。");
  Core_.requireValue(
    Number.isInteger(offset) && offset >= 0 && offset <= 100000,
    "分頁位置不正確。",
  );
  let orders = readOrders_(orderSheet_());
  if (delivery !== "all") orders = orders.filter(function (order) {
    return (Core_.orderWorkflow(order).status === "delivered") === (delivery === "delivered");
  });
  let stageCounts;
  if (!admin) {
    const stage = payload.status === undefined ? "" :
      payload.status === "awaiting_payment" ? "draft_review" : payload.status;
    const flag = payload.flag === undefined ? "" : payload.flag;
    const service = payload.service === undefined ? "" : payload.service;
    Core_.requireValue(["", "animation", "chibi", "stickers"].includes(service),
      "委託類型篩選不正確。");
    Core_.requireValue(
      typeof stage === "string" &&
        (!stage || Object.hasOwn(Core_.ORDER_STATUSES, stage)),
      "工作階段篩選不正確。",
    );
    Core_.requireValue(
      ["", "rush", "on_hold"].includes(flag),
      "附加狀態篩選不正確。",
    );
    // 封存工作不得出現在公開 API；先對完整資料篩選再分頁與計算件數。
    orders = orders.filter(function (order) {
      const flow = Core_.orderWorkflow(order);
      return !flow.isArchived && (!stage || flow.status === stage) &&
        (!service || order.service === service) &&
        (!flag || (flag === "rush" ? flow.isRush : flow.isOnHold));
    });
    stageCounts = {};
    Object.keys(Core_.ORDER_STATUSES).forEach(function (key) { stageCounts[key] = 0; });
    orders.forEach(function (order) { stageCounts[Core_.orderWorkflow(order).status] += 1; });
  }
  orders.sort(Core_.compareOrderAge);
  const page = orders.slice(offset, offset + limit);
  return {
    orders: page.map(admin ? adminOrder_ : Core_.publicOrder),
    nextOffset: offset + limit < orders.length ? offset + limit : null,
    total: orders.length,
    ...(admin ? {} : { stageCounts: stageCounts }),
  };
}

function adminOrder_(order) {
  return Object.assign(Core_.publicOrder(order), {
    revision: Number(order.revision),
    createdAt: order.createdAt,
    publicNote: order.publicNote,
    adminNote: order.adminNote,
    details: JSON.parse(order.detailsJson),
    notificationStatus: order.notificationStatus,
    notificationAttempts: Number(order.notificationAttempts),
    notificationError: order.notificationError,
    history: JSON.parse(order.historyJson),
    source: Core_.orderSource(order),
  });
}

function updateOrder_(payload, actor) {
  return lock_(function () {
    const sheet = orderSheet_();
    const current = findOrder_(sheet, payload.orderId);
    const update = Core_.validateUpdate(payload, current, COMMISSION_CONFIG_);
    const now = new Date().toISOString();
    const history = JSON.parse(current.historyJson);
    // 舊內容保存在同一列的歷史欄位，與新狀態一次寫入，避免跨工作表寫入一半。
    history.push({
      at: now,
      actor: actor.id,
      action: "updated",
      revision: Number(current.revision) + 1,
      before: {
        details: JSON.parse(current.detailsJson),
        status: current.status,
        progress: current.progress,
        publicVisible: current.publicVisible,
        publicNote: current.publicNote,
        adminNote: current.adminNote,
        isRush: Core_.orderWorkflow(current).isRush,
        isOnHold: Core_.orderWorkflow(current).isOnHold,
        isArchived: Core_.orderWorkflow(current).isArchived,
      },
    });
    const next = Object.assign({}, current, detailColumns_(update.details), {
      status: update.status,
      // 舊百分比留在原欄作歷史背景，不再作為目前進度。管理員儲存的說明為公開內容。
      publicVisible: true,
      isRush: update.isRush,
      isOnHold: update.isOnHold,
      isArchived: update.isArchived,
      publicNote: update.publicNote,
      adminNote: update.adminNote,
      updatedAt: now,
      revision: Number(current.revision) + 1,
      lastEditor: actor.id,
      historyJson: JSON.stringify(history),
    });
    writeOrder_(sheet, next);
    return adminOrder_(next);
  });
}

function notificationRecipients_() {
  const users = setting_("TELEGRAM_NOTIFY_USER_IDS", true).trim();
  const source = users || setting_("TELEGRAM_CHAT_ID", true).trim();
  const ids = Array.from(new Set(source.split(/[,\s]+/).filter(Boolean)));
  Core_.requireValue(
    ids.length > 0 && ids.length <= 20 && ids.every(function (id) {
      return (users ? /^[1-9]\d{0,15}$/ : /^-?[1-9]\d{0,15}$/).test(id) &&
        Number.isSafeInteger(Number(id));
    }),
    "請設定 1–20 位通知對象的 Telegram 數字 ID。",
    "CONFIG",
  );
  return ids.map(function (id) {
    return { id: id, status: "pending", attempts: 0, at: "", error: "" };
  });
}

function notificationStates_(order) {
  const states = JSON.parse(order.notificationRecipientsJson);
  Core_.requireValue(
    Array.isArray(states) && states.length > 0 && states.length <= 20 &&
      states.every(function (entry) {
        return entry && typeof entry.id === "string" &&
          /^-?[1-9]\d{0,15}$/.test(entry.id) &&
          ["pending", "sending", "sent", "failed", "unknown"].includes(entry.status);
      }) && new Set(states.map(function (entry) { return entry.id; })).size === states.length,
    "通知紀錄格式不符，請由維護者檢查。",
    "CONFIG",
  );
  return states;
}

function notificationStatus_(states) {
  if (states.every(function (entry) { return entry.status === "sent"; })) return "sent";
  if (states.some(function (entry) { return entry.status === "unknown"; })) return "unknown";
  if (states.some(function (entry) { return entry.status === "failed"; })) return "failed";
  if (states.some(function (entry) { return ["pending", "sending"].includes(entry.status); })) return "sending";
  return "failed";
}

function notifyOrder_(id, retry) {
  const claim = lock_(function () {
    const sheet = orderSheet_();
    const order = findOrder_(sheet, id);
    if (Core_.orderSource(order)) return { done: true, status: "not_required" };
    if (order.notificationStatus === "sent") return { done: true, status: "sent" };
    if (
      order.notificationStatus === "sending" &&
      Date.now() - Date.parse(order.notificationAt) < 120000
    ) {
      throw new Core_.OrderError("BUSY", "通知仍在傳送中，請稍後重新載入。");
    }
    if (!retry && order.notificationStatus !== "pending") {
      return { done: true, status: order.notificationStatus };
    }
    order.notificationStatus = "sending";
    order.notificationAttempts = Number(order.notificationAttempts) + 1;
    order.notificationAt = new Date().toISOString();
    order.notificationError = "";
    let recipients;
    try {
      // 首次通知固定收件名單；之後新增的 ID 不會收到舊單，舊版已送達單也不補發。
      recipients = order.notificationRecipientsJson
        ? notificationStates_(order)
        : notificationRecipients_();
      // 文字快照只保存一份；管理員修改或重試時，不會混用不同版本的分段內容。
      if (!recipients[0].messageTexts) recipients[0].messageTexts = orderNotificationChunks_(order);
      const attachments = JSON.parse(order.detailsJson).attachments || [];
      recipients.forEach(function (recipient) {
        if (recipient.status !== "sent" && !recipient.textParts) {
          recipient.textParts = recipients[0].messageTexts.map(function () { return { status: "pending", attempts: 0 }; });
        }
        if (recipient.status !== "sent" && attachments.length && !recipient.parts) {
          recipient.parts = attachments.map(function () { return { status: "pending", attempts: 0 }; });
        }
      });
      order.notificationRecipientsJson = JSON.stringify(recipients);
    } catch (error) {
      order.notificationStatus = "failed";
      order.notificationError = "CONFIG";
      writeOrder_(sheet, order);
      return { done: true, status: "failed" };
    }
    writeOrder_(sheet, order);
    return { order: order, recipients: recipients };
  });
  if (claim.done) return { status: claim.status };
  return notifyOrderParts_(id, claim);
}
