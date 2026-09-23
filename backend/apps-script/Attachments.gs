/** 僅由專案擁有者執行。使用 drive.file，只存取此服務建立的私人附件。 */
function setupReferenceStorage() {
  const active = Session.getActiveUser().getEmail();
  Core_.requireValue(active && active === Session.getEffectiveUser().getEmail(),
    "請由專案編輯者執行附件儲存初始化。", "FORBIDDEN");
  return lock_(function () {
    if (setting_("REFERENCE_FOLDER_ID", true)) {
      referenceFolder_();
      return "附件儲存已設定。";
    }
    const folder = Drive.Files.create({
      name: "爛爛 LANLAN｜委託附件",
      mimeType: "application/vnd.google-apps.folder",
      appProperties: { lanlanReferenceStorage: "1" },
    }, null, { fields: "id" });
    PropertiesService.getScriptProperties().setProperty("REFERENCE_FOLDER_ID", folder.id);
    return "已建立私人附件資料夾。";
  });
}

function driveReferenceResponse_(path, missingAllowed) {
  // 只使用固定 Drive API；不抓取使用者提供的素材網址，也不把 OAuth Token 交給前端。
  const response = UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/files/" + path, {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
    followRedirects: false,
  });
  if (missingAllowed && response.getResponseCode() === 404) return null;
  Core_.requireValue(response.getResponseCode() === 200,
    "暫時無法存取委託附件，請稍後重試或聯絡維護者。", "ATTACHMENT");
  return response;
}

function referenceFolder_() {
  const id = setting_("REFERENCE_FOLDER_ID", true);
  Core_.requireValue(typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id),
    "圖片上傳尚未完成設定，請先提供參考素材連結。", "NOT_CONFIGURED");
  const folder = JSON.parse(driveReferenceResponse_(id + "?fields=id,mimeType,trashed,appProperties").getContentText());
  Core_.requireValue(!folder.trashed && folder.mimeType === "application/vnd.google-apps.folder" &&
    folder.appProperties?.lanlanReferenceStorage === "1", "附件資料夾設定不正確。", "CONFIG");
  return id;
}

function bytesDigest_(bytes, algorithm) {
  return Utilities.computeDigest(algorithm || Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function (value) { return (value & 255).toString(16).padStart(2, "0"); }).join("");
}

function parseReferenceUpload_(input, imagesOnly) {
  Core_.requireValue(input && typeof input === "object" && !Array.isArray(input), "圖片資料格式不正確。");
  const error = Core_.attachmentFileError(input);
  Core_.requireValue(!error, error);
  Core_.requireValue(typeof input.name === "string" && input.name.trim().length > 0 &&
    input.name.length <= 150 && !/[\x00-\x1f\x7f\\/]/.test(input.name), "圖片檔名不正確或過長。");
  Core_.requireValue(typeof input.base64 === "string" &&
    input.base64.length === Math.ceil(input.size / 3) * 4 &&
    !/[^A-Za-z0-9+/=]/.test(input.base64) && !/=/.test(input.base64.slice(0, -2)), "圖片編碼不正確。");
  let bytes;
  try { bytes = Utilities.base64Decode(input.base64); }
  catch { throw new Core_.OrderError("VALIDATION", "圖片編碼不正確。"); }
  Core_.requireValue(bytes.length === input.size && Utilities.base64Encode(bytes) === input.base64, "圖片大小或編碼不正確。");
  const unsigned = bytes.slice(0, 32).map(function (value) { return value & 255; });
  const text = unsigned.map(function (value) { return String.fromCharCode(value); }).join("");
  const type = unsigned.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10" ? "image/png" :
    unsigned[0] === 255 && unsigned[1] === 216 && unsigned[2] === 255 ? "image/jpeg" :
    /^GIF8[79]a/.test(text) ? "image/gif" :
    text.slice(0, 4) === "RIFF" && text.slice(8, 12) === "WEBP" ? "image/webp" :
    text.slice(4, 8) === "ftyp" && /avif|avis/.test(text.slice(8)) ? "image/avif" : "";
  Core_.requireValue(!Core_.ATTACHMENT_TYPES.includes(input.type) || type === input.type,
    "圖片內容與格式不符，請重新選擇有效圖片。");
  Core_.requireValue(!imagesOnly || Boolean(type), "貼圖包請提供有效圖片。");
  const sha256 = bytesDigest_(bytes);
  Core_.requireValue(sha256 === input.sha256, "檔案內容已變動，請重新選擇檔案。");
  return { name: input.name.trim(), type: type, size: bytes.length, bytes: bytes,
    storageType: type || "application/octet-stream", sha256: sha256,
    md5: bytesDigest_(bytes, Utilities.DigestAlgorithm.MD5) };
}

function submissionInput_(payload) {
  Core_.requireValue(typeof payload.requestId === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(payload.requestId),
    "送件識別碼不正確。");
  Core_.requireValue(!payload.website, "無法受理這份委託。");
  const manifest = Core_.attachmentManifest(payload.attachments);
  const legacy = payload.details?.schemaVersion === 3 && manifest.length === 0;
  const details = Core_.validateSubmission(payload.details, COMMISSION_CONFIG_, {
    hasAttachments: manifest.length > 0, allowPreviousVersion: legacy,
  });
  // 發布交接期間的舊分頁仍可用連結收件；維持舊雜湊以便取回既有回執。
  if (legacy) details.schemaVersion = 3;
  manifest.forEach(function (file) {
    const error = Core_.attachmentFileError(file, details.service === "stickers");
    Core_.requireValue(!error, error);
  });
  return { details: details, manifest: manifest,
    hash: digest_(JSON.stringify(manifest.length ? { details: details, attachments: manifest } : details)) };
}

function checkSubmissionCapacity_(orders, details, requestId) {
  Core_.requireValue(setting_("ACCEPTING_ORDERS", true) === "true", "目前暫停收件，請先聯絡繪師。", "CLOSED");
  const recent = orders.filter(function (order) {
    return !Core_.orderSource(order) && Date.parse(order.createdAt) > Date.now() - 86400000;
  });
  const contactHash = digest_(JSON.stringify(details.contact));
  const props = PropertiesService.getScriptProperties().getProperties();
  const pending = Object.keys(props).filter(function (key) { return key.startsWith("REFERENCE_UPLOAD_"); })
    .map(function (key) { return Object.assign({ requestId: key.slice(17) }, JSON.parse(props[key])); })
    .filter(function (item) {
      return item.requestId !== requestId && Date.parse(item.at) > Date.now() - 86400000 &&
        !orders.some(function (order) { return order.requestId === item.requestId; });
    });
  const limit = Number(setting_("DAILY_ORDER_LIMIT", true) || 50);
  Core_.requireValue(Number.isInteger(limit) && limit > 0 && recent.length + pending.length < limit,
    "今日收件已達上限，請稍後再試或聯絡繪師。", "RATE_LIMIT");
  const same = recent.filter(function (order) {
    return Date.parse(order.createdAt) > Date.now() - 3600000 &&
      order.contactChannel === details.contact.channel && order.contactValue === details.contact.value;
  }).length + pending.filter(function (item) {
    return Date.parse(item.at) > Date.now() - 3600000 && item.contactHash === contactHash;
  }).length;
  Core_.requireValue(same < 3, "這個聯絡方式短時間內送件較多，請稍後再試。", "RATE_LIMIT");
}

function uploadOrderReference_(payload) {
  const input = submissionInput_(payload);
  Core_.requireValue(Number.isInteger(payload.index) && payload.index >= 0 && payload.index < input.manifest.length,
    "附件位置不正確。");
  const upload = parseReferenceUpload_(Object.assign({}, input.manifest[payload.index], { base64: payload.data }),
    input.details.service === "stickers");
  return lock_(function () {
    const orders = readOrders_(orderSheet_());
    const existing = orders.find(function (order) { return order.requestId === payload.requestId; });
    if (existing) {
      Core_.requireValue(existing.requestHash === input.hash, "同一送件識別碼的內容不同。", "CONFLICT");
      return { index: payload.index, uploaded: true };
    }
    checkSubmissionCapacity_(orders, input.details, payload.requestId);
    storeReferenceUpload_(upload, payload, input);
    return { index: payload.index, uploaded: true };
  });
}

function storeReferenceUpload_(upload, payload, input) {
  const folder = referenceFolder_();
  const properties = PropertiesService.getScriptProperties();
  const key = "REFERENCE_UPLOAD_" + payload.requestId;
  const saved = properties.getProperty(key);
  let reservation = saved ? JSON.parse(saved) : null;
  if (reservation) Core_.requireValue(reservation.hash === input.hash,
    "同一送件識別碼的圖片或內容不同，請保留原內容重試。", "CONFLICT");
  else {
    reservation = { hash: input.hash, contactHash: digest_(JSON.stringify(input.details.contact)),
      at: new Date().toISOString(), files: input.manifest.map(function () { return null; }) };
  }
  if (!reservation.files[payload.index]) {
    reservation.files[payload.index] = { id: Drive.Files.generateIds({ count: 1, space: "drive", type: "files" }).ids[0] };
    // 先保留 ID，避免 Drive 已成功而回應中斷時重複上傳。
    properties.setProperty(key, JSON.stringify(reservation));
  }
  const slot = reservation.files[payload.index];
  const fields = "id,size,mimeType,md5Checksum,parents,trashed,appProperties";
  const existing = driveReferenceResponse_(slot.id + "?fields=" + fields, true);
  const file = existing ? JSON.parse(existing.getContentText()) : Drive.Files.create({
    id: slot.id, name: upload.name, mimeType: upload.storageType, parents: [folder],
    appProperties: { lanlanRequest: payload.requestId, lanlanHash: input.hash },
  }, Utilities.newBlob(upload.bytes, upload.storageType, upload.name), { fields: fields });
  Core_.requireValue(!file.trashed && file.parents?.includes(folder) &&
    file.appProperties?.lanlanHash === input.hash && Number(file.size) === upload.size &&
    file.md5Checksum === upload.md5 && file.mimeType === upload.storageType,
    "無法確認圖片保存結果，請保留原內容重試。", "ATTACHMENT");
  reservation.files[payload.index] = { id: file.id, name: upload.name, type: upload.storageType, size: upload.size,
    sha256: upload.sha256, uploadedAt: reservation.at };
  properties.setProperty(key, JSON.stringify(reservation));
}

function completedReferences_(requestId, input) {
  const saved = PropertiesService.getScriptProperties().getProperty("REFERENCE_UPLOAD_" + requestId);
  const reservation = saved ? JSON.parse(saved) : null;
  Core_.requireValue(reservation && reservation.hash === input.hash &&
    reservation.files.length === input.manifest.length && reservation.files.every(function (file, index) {
      return file && file.sha256 === input.manifest[index].sha256 && file.uploadedAt;
    }), "參考檔案尚未全部上傳完成，請保留此頁並重試。", "ATTACHMENT");
  return reservation.files;
}

function referenceBlob_(order, index) {
  const attachment = JSON.parse(order.detailsJson).attachments?.[index];
  Core_.requireValue(attachment && /^[A-Za-z0-9_-]+$/.test(attachment.id), "這筆委託沒有已上傳圖片。", "NOT_FOUND");
  const folder = setting_("REFERENCE_FOLDER_ID");
  const file = JSON.parse(driveReferenceResponse_(attachment.id + "?fields=id,parents,size,mimeType,trashed").getContentText());
  Core_.requireValue(!file.trashed && file.parents?.includes(folder) && Number(file.size) === attachment.size &&
    attachment.size <= Core_.ATTACHMENT_MAX_BYTES && file.mimeType === attachment.type,
    "附件已變動或無法存取，請聯絡維護者。", "ATTACHMENT");
  const bytes = driveReferenceResponse_(attachment.id + "?alt=media").getBlob().getBytes();
  Core_.requireValue(bytes.length === attachment.size && bytesDigest_(bytes) === attachment.sha256,
    "附件完整性檢查失敗，請聯絡維護者。", "ATTACHMENT");
  return Utilities.newBlob(bytes, attachment.type, attachment.name);
}

function adminReference_(payload) {
  Core_.requireValue(Number.isInteger(payload.index) && payload.index >= 0 && payload.index < Core_.ATTACHMENT_MAX_FILES,
    "附件位置不正確。");
  const order = findOrder_(orderSheet_(), payload.orderId);
  const attachment = JSON.parse(order.detailsJson).attachments?.[payload.index];
  const blob = referenceBlob_(order, payload.index);
  return { name: attachment.name, type: attachment.type, size: attachment.size,
    base64: Utilities.base64Encode(blob.getBytes()) };
}

function referenceCaption_(order, names) {
  return "收到新的委託\n編號：" + order.orderId +
    "\n類型：" + COMMISSION_CONFIG_.services[order.service].name +
    (names?.length ? "\n參考檔案：" + names.length + " 個" : "") +
    (setting_("ADMIN_URL", true) ? "\n請至管理後台查看：" + adminUrl_() : "");
}

function sendOrderNotification_(order, recipient, blob, index, reuse) {
  const details = JSON.parse(order.detailsJson);
  const attachment = details.attachments?.[index];
  const heading = referenceCaption_(order, attachment ? [attachment.name] : []) +
    (attachment ? "\n附件：" + attachment.name : "");
  const endpoint = "https://api.telegram.org/bot" + setting_("TELEGRAM_BOT_TOKEN") + "/";
  const method = reuse?.method || (["image/jpeg", "image/png", "image/webp"].includes(attachment.type) ? "sendPhoto" :
    attachment.type === "image/gif" ? "sendAnimation" : "sendDocument");
  const field = { sendPhoto: "photo", sendAnimation: "animation", sendDocument: "document" }[method];
  const response = UrlFetchApp.fetch(endpoint + method, {
    method: "post", muteHttpExceptions: true, followRedirects: false,
    payload: { chat_id: recipient.id, caption: heading, [field]: reuse?.fileId || blob },
  });
  // Telegram 對尺寸／比例的限制可能拒絕有效圖片；明確 400 才改送原檔，逾時不可自動重送。
  if (!reuse && method !== "sendDocument" && response.getResponseCode() === 400 &&
      JSON.parse(response.getContentText()).ok === false) {
    return UrlFetchApp.fetch(endpoint + "sendDocument", {
      method: "post", muteHttpExceptions: true, followRedirects: false,
      payload: { chat_id: recipient.id, caption: heading, document: blob },
    });
  }
  return response;
}

/** 相簿以一個 sendMediaGroup 送出；只有首張帶說明，Telegram 才會合併顯示。 */
function sendReferenceBatch_(order, recipient, indices, reusable) {
  if (indices.length === 1) {
    const index = indices[0];
    return sendOrderNotification_(order, recipient, reusable[index] ? null : referenceBlob_(order, index), index, reusable[index]);
  }
  const attachments = JSON.parse(order.detailsJson).attachments;
  let type = indices.every(function (index) {
    return ["image/jpeg", "image/png", "image/webp"].includes(attachments[index].type);
  }) ? "photo" : "document";
  if (indices.every(function (index) { return reusable[index]?.method === "sendDocument"; })) type = "document";
  const blobs = {};
  function send(kind) {
    const payload = { chat_id: recipient.id };
    const method = kind === "photo" ? "sendPhoto" : "sendDocument";
    const media = indices.map(function (index, position) {
      const reuse = reusable[index]?.method === method ? reusable[index].fileId : "";
      if (!reuse) {
        if (!blobs[index]) blobs[index] = referenceBlob_(order, index);
        payload["file_" + index] = blobs[index];
      }
      const item = { type: kind, media: reuse || "attach://file_" + index };
      if (kind === "document") item.disable_content_type_detection = true;
      if (position === 0) item.caption = referenceCaption_(order, indices.map(function (i) { return attachments[i].name; }));
      return item;
    });
    payload.media = JSON.stringify(media);
    return UrlFetchApp.fetch("https://api.telegram.org/bot" + setting_("TELEGRAM_BOT_TOKEN") + "/sendMediaGroup", {
      method: "post", muteHttpExceptions: true, followRedirects: false, payload: payload,
    });
  }
  const response = send(type);
  if (type === "photo" && response.getResponseCode() === 400 && JSON.parse(response.getContentText()).ok === false)
    return send("document");
  return response;
}
