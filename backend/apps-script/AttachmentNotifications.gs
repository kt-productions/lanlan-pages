function referenceDeliveryResults_(response, count) {
  const body = JSON.parse(response.getContentText());
  const accepted = response.getResponseCode() === 200 && body.ok === true;
  const messages = count === 1 ? [body.result || {}] : body.result;
  const complete = accepted && Array.isArray(messages) && messages.length === count;
  return Array.from({ length: count }, function (_, index) {
    const result = { status: complete ? "sent" : accepted ? "unknown" : "failed",
      error: complete ? "" : accepted ? "DELIVERY_UNKNOWN" : "TELEGRAM_REJECTED" };
    if (!complete) return result;
    const message = messages[index] || {};
    const media = message.animation ? { method: "sendAnimation", fileId: message.animation.file_id } :
      message.photo?.length ? { method: "sendPhoto", fileId: message.photo[message.photo.length - 1].file_id } :
      message.document ? { method: "sendDocument", fileId: message.document.file_id } : null;
    if (media && typeof media.fileId === "string" && media.fileId.length <= 256) result.media = media;
    if (typeof message.media_group_id === "string" && message.media_group_id.length <= 100) result.groupId = message.media_group_id;
    return result;
  });
}

/** 文字逐段與圖片相簿各自保存回執，重試不重送已確認的文字或附件。 */
function notifyOrderParts_(id, claim) {
  const attachments = JSON.parse(claim.order.detailsJson).attachments || [];
  const texts = claim.recipients[0].messageTexts;
  const started = Date.now();
  const reusable = {};
  claim.recipients.forEach(function (recipient) {
    (recipient.parts || []).forEach(function (part, index) {
      if (part.status === "sent" && part.media) reusable[index] = part.media;
    });
  });
  outer: for (const recipient of claim.recipients) {
    if (recipient.status === "sent") continue;
    for (let index = 0; index < texts.length; index += 1) {
      if (recipient.textParts[index].status === "sent") continue;
      if (Date.now() - started > 80000) break outer;
      const prepared = lock_(function () {
        const sheet = orderSheet_();
        const current = findOrder_(sheet, id);
        if (Number(current.notificationAttempts) !== claim.order.notificationAttempts) return false;
        const states = notificationStates_(current);
        const target = states.find(function (item) { return item.id === recipient.id; });
        if (target.textParts[index].status === "sent") return false;
        target.textParts[index] = { status: "sending", attempts: target.textParts[index].attempts + 1 };
        target.status = "sending";
        target.attempts += 1;
        current.notificationAt = new Date().toISOString();
        current.notificationRecipientsJson = JSON.stringify(states);
        writeOrder_(sheet, current);
        return true;
      });
      if (!prepared) continue;
      let result = { status: "unknown", error: "DELIVERY_UNKNOWN" };
      try {
        const response = sendNotificationText_(recipient, texts[index]);
        const accepted = response.getResponseCode() === 200 && JSON.parse(response.getContentText()).ok === true;
        result = { status: accepted ? "sent" : "failed", error: accepted ? "" : "TELEGRAM_REJECTED" };
      } catch (error) {
        if (error.code === "CONFIG") result = { status: "failed", error: "CONFIG" };
      }
      lock_(function () {
        const sheet = orderSheet_();
        const current = findOrder_(sheet, id);
        if (Number(current.notificationAttempts) !== claim.order.notificationAttempts) return;
        const states = notificationStates_(current);
        const target = states.find(function (item) { return item.id === recipient.id; });
        Object.assign(target.textParts[index], result, { at: new Date().toISOString() });
        target.status = notificationStatus_([...(target.parts || []), ...target.textParts]);
        target.error = target.status === "sent" ? "" : "PARTIAL_DELIVERY";
        target.at = new Date().toISOString();
        current.notificationAt = target.at;
        current.notificationRecipientsJson = JSON.stringify(states);
        // 維持整份通知的 sending 租約，避免文字完成到附件送出之間重入。
        writeOrder_(sheet, current);
      });
      // 一段失敗時保留後續段落待重試，避免閱讀順序被打亂。
      if (result.status !== "sent") break;
    }
    const pending = attachments.map(function (_, index) { return index; }).filter(function (index) {
      return recipient.parts?.[index]?.status !== "sent";
    });
    const photos = pending.filter(function (index) {
      return ["image/jpeg", "image/png", "image/webp"].includes(attachments[index].type);
    });
    const documents = pending.filter(function (index) { return !photos.includes(index); });
    for (const batch of [photos, documents].filter(function (items) { return items.length; })) {
      // 保留回執處理時間；剩餘附件由既有後台「重試通知」接續。
      if (Date.now() - started > 80000) break outer;
      const prepared = lock_(function () {
        const sheet = orderSheet_();
        const current = findOrder_(sheet, id);
        if (Number(current.notificationAttempts) !== claim.order.notificationAttempts) return [];
        const states = notificationStates_(current);
        const target = states.find(function (item) { return item.id === recipient.id; });
        if (!target.parts) target.parts = attachments.map(function () { return { status: "pending", attempts: 0 }; });
        const indices = batch.filter(function (index) { return target.parts[index].status !== "sent"; });
        if (!indices.length) return [];
        indices.forEach(function (index) {
          target.parts[index] = { status: "sending", attempts: target.parts[index].attempts + 1 };
        });
        target.status = "sending";
        target.attempts += 1;
        current.notificationAt = new Date().toISOString();
        current.notificationRecipientsJson = JSON.stringify(states);
        writeOrder_(sheet, current);
        return indices;
      });
      if (!prepared.length) continue;
      let results = prepared.map(function () { return { status: "unknown", error: "DELIVERY_UNKNOWN" }; });
      try {
        results = referenceDeliveryResults_(sendReferenceBatch_(claim.order, recipient, prepared, reusable), prepared.length);
        results.forEach(function (result, position) {
          if (result.status === "sent" && result.media) reusable[prepared[position]] = result.media;
        });
      } catch (error) {
        if (["CONFIG", "ATTACHMENT"].includes(error.code)) results = prepared.map(function () {
          return { status: "failed", error: error.code };
        });
      }
      lock_(function () {
        const sheet = orderSheet_();
        const current = findOrder_(sheet, id);
        if (Number(current.notificationAttempts) !== claim.order.notificationAttempts) return;
        const states = notificationStates_(current);
        const target = states.find(function (item) { return item.id === recipient.id; });
        prepared.forEach(function (index, position) {
          Object.assign(target.parts[index], results[position], { at: new Date().toISOString() });
        });
        target.status = notificationStatus_([...target.parts, ...target.textParts]);
        target.error = target.status === "sent" ? "" : "PARTIAL_DELIVERY";
        current.notificationAt = new Date().toISOString();
        current.notificationRecipientsJson = JSON.stringify(states);
        // 整批作業完成前維持 sending 租約，禁止另一個請求重複寄送。
        writeOrder_(sheet, current);
      });
    }
  }
  return lock_(function () {
    const sheet = orderSheet_();
    const current = findOrder_(sheet, id);
    if (Number(current.notificationAttempts) !== claim.order.notificationAttempts)
      return { status: current.notificationStatus };
    const states = notificationStates_(current);
    current.notificationStatus = notificationStatus_(states);
    if (current.notificationStatus === "sending") current.notificationStatus = "pending";
    current.notificationError = current.notificationStatus === "sent" ? "" : "PARTIAL_DELIVERY";
    current.notificationAt = new Date().toISOString();
    writeOrder_(sheet, current);
    return { status: current.notificationStatus };
  });
}
