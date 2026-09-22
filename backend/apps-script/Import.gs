/** 只供專案編輯者執行；不開放 HTTP 匯入入口，也不經過新表單收件／通知流程。 */
function importTrelloOrders_(payload) {
  const active = Session.getActiveUser().getEmail();
  Core_.requireValue(active && active === Session.getEffectiveUser().getEmail(),
    "請由專案編輯者執行匯入。", "FORBIDDEN");
  Core_.requireValue(payload && payload.version === 1 &&
    Array.isArray(payload.cards) && payload.cards.length > 0 && payload.cards.length <= 500,
    "匯入批次格式不正確。");
  const now = new Date().toISOString();
  const unique = new Set();
  // 全批驗證完成才取得工作表並寫入，任何格式錯誤都不應留下半批資料。
  const candidates = payload.cards.map(function (card) {
    const source = card.source;
    Core_.requireValue(source && source.kind === "trello" &&
      /^[a-f0-9]{24}$/.test(source.cardId) && /^[a-f0-9]{24}$/.test(source.boardId) &&
      /^[a-f0-9]{24}$/.test(source.listId) &&
      typeof source.cardName === "string" && source.cardName.trim().length > 0 && source.cardName.length <= 1000 &&
      typeof source.boardName === "string" && source.boardName.length <= 1000 &&
      typeof source.listName === "string" && source.listName.length <= 1000 &&
      /^https:\/\/trello\.com\/c\/[a-zA-Z0-9]+$/.test(source.cardUrl) &&
      [source.boardOrder, source.listPosition, source.cardPosition].every(function (n) {
        return Number.isFinite(n) && n >= 0;
      }) && typeof source.archived === "boolean" && typeof source.publishTitle === "boolean" &&
      Array.isArray(source.labels) && source.labels.length <= 30 && source.labels.every(function (label) {
        return typeof label === "string" && label.length <= 200;
      }) && Array.isArray(source.attachments) && source.attachments.length <= 100 &&
      source.attachments.every(function (attachment) {
        return attachment && typeof attachment.name === "string" && attachment.name.length <= 1000 &&
          typeof attachment.url === "string" && attachment.url.length <= 2000 &&
          /^https:\/\/trello\.com\/[^\s]+$/.test(attachment.url);
      }) && typeof source.lastActivity === "string" && Number.isFinite(Date.parse(source.lastActivity)),
      "Trello 來源格式不正確。");
    Core_.requireValue(!unique.has(source.cardId), "批次中包含重複的來源卡片。");
    unique.add(source.cardId);
    Core_.requireValue(["animation", "chibi", "stickers"].includes(card.service) &&
      Object.hasOwn(Core_.ORDER_STATUSES, card.status) &&
      typeof card.isRush === "boolean" && typeof card.isOnHold === "boolean",
      "匯入工作階段或類型不正確。");
    // 重建白名單，避免把完整匯出檔、附件或其他欄位意外存入訂單。
    const savedSource = { kind: "trello" };
    ["cardId", "boardId", "listId", "cardName", "boardName", "listName", "cardUrl",
      "boardOrder", "listPosition", "cardPosition", "archived", "publishTitle", "labels", "lastActivity"]
      .forEach(function (key) { savedSource[key] = source[key]; });
    savedSource.importedAt = now;
    savedSource.attachments = source.attachments.map(function (attachment) {
      return { name: attachment.name, url: attachment.url };
    });
    const details = {
      recordType: "trello-import", service: card.service, nickname: source.cardName,
      contact: null, referenceUrl: null, notes: null, estimatedPrice: null,
    };
    const hex = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, "trello:" + source.cardId)
      .map(function (byte) { return (byte & 255).toString(16).padStart(2, "0"); }).join("");
    return Object.assign(detailColumns_(details), {
      orderId: "LL-" + hex.slice(0, 16).toUpperCase(),
      requestId: "trello:" + source.cardId,
      requestHash: digest_(JSON.stringify(savedSource)),
      createdAt: now, updatedAt: now, revision: 1,
      status: card.status, progress: "", publicVisible: true,
      isRush: card.isRush, isOnHold: card.isOnHold,
      publicNote: "", adminNote: "", lastEditor: "trello-import",
      notificationStatus: "not_required", notificationAttempts: 0,
      notificationError: "", notificationAt: "", notificationRecipientsJson: "",
      sourceJson: JSON.stringify(savedSource),
      historyJson: JSON.stringify([{ at: now, actor: "trello-import", action: "imported", revision: 1 }]),
    });
  });
  return lock_(function () {
    const sheet = orderSheet_();
    const existing = readOrders_(sheet);
    const sources = new Set(existing.map(function (order) {
      const source = Core_.orderSource(order);
      return source ? source.cardId : null;
    }));
    const ids = new Set(existing.map(function (order) { return order.orderId; }));
    const pending = candidates.filter(function (order) {
      return !sources.has(Core_.orderSource(order).cardId);
    });
    pending.forEach(function (order) {
      Core_.requireValue(!ids.has(order.orderId), "委託編號衝突，請停止匯入。", "CONFLICT");
      ids.add(order.orderId);
    });
    const values = pending.map(orderValues_);
    if (values.length) {
      const start = sheet.getLastRow() + 1;
      const missing = start + values.length - 1 - sheet.getMaxRows();
      if (missing > 0) sheet.insertRowsAfter(sheet.getMaxRows(), missing);
      sheet.getRange(start, 1, values.length, ORDER_HEADERS_.length).setValues(values);
      SpreadsheetApp.flush();
    }
    return { imported: pending.length, skipped: candidates.length - pending.length,
      total: existing.length + pending.length, notifications: 0 };
  });
}
