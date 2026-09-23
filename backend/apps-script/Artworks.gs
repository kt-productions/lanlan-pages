const ARTWORK_JOB_HEADERS_ = ["operationId", "recordJson"];

/** 僅建立作品專用工作表及私人資料夾，不改動既有委託或附件。 */
function setupArtworkStorage() {
  const active = Session.getActiveUser().getEmail();
  Core_.requireValue(active && active === Session.getEffectiveUser().getEmail(), "請由專案編輯者執行初始化。", "FORBIDDEN");
  return lock_(function () {
    const book = SpreadsheetApp.openById(setting_("SPREADSHEET_ID"));
    let sheet = book.getSheetByName("ArtworkJobs");
    if (!sheet) sheet = book.insertSheet("ArtworkJobs");
    if (!sheet.getLastRow()) sheet.getRange(1, 1, 1, 2).setValues([ARTWORK_JOB_HEADERS_]);
    artworkSheet_();
    if (!setting_("ARTWORK_FOLDER_ID", true)) {
      const folder = Drive.Files.create({ name: "作品發布暫存", mimeType: "application/vnd.google-apps.folder",
        appProperties: { artworkStorage: "1" } }, null, { fields: "id" });
      PropertiesService.getScriptProperties().setProperty("ARTWORK_FOLDER_ID", folder.id);
    }
    artworkFolder_();
    return "已建立作品專用工作表與私人暫存資料夾，發布仍須完成 GitHub App 設定。";
  });
}
function artworkSheet_() {
  const sheet = SpreadsheetApp.openById(setting_("SPREADSHEET_ID")).getSheetByName("ArtworkJobs");
  Core_.requireValue(sheet && JSON.stringify(sheet.getRange(1, 1, 1, 2).getValues()[0]) === JSON.stringify(ARTWORK_JOB_HEADERS_),
    "作品工作表尚未初始化或欄位不符。", "CONFIG");
  return sheet;
}
function artworkJobs_() {
  const sheet = artworkSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().map(function (row, index) {
    const job = JSON.parse(row[1]);
    Core_.requireValue(job.operationId === row[0], "作品工作紀錄不一致。", "CONFIG");
    return Object.assign(job, { row: index + 2 });
  });
}
function writeArtworkJob_(job) {
  const sheet = artworkSheet_();
  const saved = Object.assign({}, job);
  delete saved.row;
  const json = JSON.stringify(saved);
  Core_.requireValue(json.length < 40000, "作品工作紀錄容量不足。", "CAPACITY");
  const row = job.row || sheet.getLastRow() + 1;
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
  sheet.getRange(row, 1, 1, 2).setValues([[job.operationId, json]]);
  SpreadsheetApp.flush();
  job.row = row;
  return job;
}
function artworkJob_(operationId) {
  ArtworkCore_.artworkOperation(operationId);
  const job = artworkJobs_().find(function (item) { return item.operationId === operationId; });
  Core_.requireValue(job && job.siteId === artworkConfig_().site, "找不到這份作品工作。", "NOT_FOUND");
  return job;
}
function artworkFolder_() {
  const id = setting_("ARTWORK_FOLDER_ID");
  Core_.requireValue(/^[A-Za-z0-9_-]+$/.test(id), "作品暫存資料夾設定不正確。", "CONFIG");
  const file = JSON.parse(driveReferenceResponse_(id + "?fields=id,mimeType,trashed,appProperties").getContentText());
  Core_.requireValue(!file.trashed && file.mimeType === "application/vnd.google-apps.folder" && file.appProperties?.artworkStorage === "1",
    "作品暫存資料夾設定不正確。", "CONFIG");
  return id;
}
function artworkPublicJob_(job) {
  return { operationId: job.operationId, state: job.state, revision: job.revision, action: job.action,
    work: job.work, expectedRevision: job.expectedRevision, file: job.file ? ArtworkCore_.artworkFile(job.file) : null,
    uploaded: Boolean(job.file?.uploaded), error: job.error || "", cleanup: job.cleanup || "pending",
    createdAt: job.createdAt, updatedAt: job.updatedAt, commitSha: job.commitSha || "" };
}
function listArtworks_() {
  const config = artworkConfig_();
  const sha = artworkGitHub_("git/ref/heads/main").object.sha;
  const manifest = artworkManifest_(sha);
  return { works: ArtworkCore_.mergeArtworks(ARTWORK_BASE_, manifest),
    previewBase: "https://raw.githubusercontent.com/" + config.repo + "/" + sha + "/public/",
    jobs: artworkJobs_().filter(function (job) { return job.siteId === config.site; }).map(artworkPublicJob_), maxBytes: ArtworkCore_.ARTWORK_MAX_BYTES };
}
function saveArtwork_(payload) {
  const config = artworkConfig_();
  ArtworkCore_.artworkOperation(payload.operationId);
  const fields = ArtworkCore_.artworkFields(payload.work);
  Core_.requireValue(["upsert", "delete"].includes(payload.action), "作品操作不正確。");
  const file = payload.file ? ArtworkCore_.artworkFile(payload.file) : null;
  const catalog = ArtworkCore_.mergeArtworks(ARTWORK_BASE_, artworkManifest_("main"), true);
  return lock_(function () {
    const jobs = artworkJobs_();
    let job = jobs.find(function (item) { return item.operationId === payload.operationId; });
    const inputHash = digest_(JSON.stringify({ action: payload.action, work: fields, id: payload.id || "",
      expectedRevision: payload.expectedRevision, file: file }));
    if (job && job.inputHash === inputHash) return artworkPublicJob_(job);
    Core_.requireValue(!job || (job.state === "draft" && job.revision === payload.revision), "草稿已變更或已送出，請重新載入。", "CONFLICT");
    Core_.requireValue(!job || (job.work.category === fields.category && job.sourceId === (payload.id || "") && job.expectedRevision === payload.expectedRevision),
      "草稿的作品識別與基礎版本不能變更。", "CONFLICT");
    Core_.requireValue(!job?.file || job.file.sha256 === file?.sha256, "已保存的草稿不能換檔，請另建草稿。", "CONFLICT");
    const current = catalog.find(function (item) { return item.id === payload.id; });
    Core_.requireValue(Number.isInteger(payload.expectedRevision) && payload.expectedRevision >= 0 &&
      (!payload.id || (current && !current.deleted && current.category === fields.category && current.revision === payload.expectedRevision)),
      "作品版本已變更，請重新讀取。", "CONFLICT");
    Core_.requireValue(payload.id || (payload.action === "upsert" && file && payload.expectedRevision === 0), "新作品需要上傳檔案。");
    Core_.requireValue(payload.action !== "delete" || !file, "下架不需上傳檔案。");
    const active = jobs.filter(function (item) { return !["published", "cancelled", "superseded"].includes(item.state); });
    Core_.requireValue(job || active.length < 30, "待處理作品已達 30 件，請先完成或清理草稿。", "CAPACITY");
    const bytes = jobs.filter(function (item) { return item.cleanup !== "cleaned" && item.operationId !== payload.operationId; })
      .reduce(function (sum, item) { return sum + (item.file?.size || 0); }, 0);
    Core_.requireValue(bytes + (file?.size || 0) <= 200 * 1024 * 1024, "作品暫存已達 200 MiB，請先處理既有工作。", "CAPACITY");
    let id = job?.work.id || payload.id;
    if (!id) {
      const props = PropertiesService.getScriptProperties();
      const key = "ARTWORK_SEQUENCE_" + fields.category;
      const max = Math.max(Number(props.getProperty(key) || 0), ...catalog.filter(function (item) { return item.category === fields.category; })
        .map(function (item) { return Number(item.id.split("-").pop()); }));
      const next = max + 1;
      props.setProperty(key, String(next));
      id = fields.category + "-" + String(next).padStart(2, "0");
    }
    job = Object.assign(job || { operationId: payload.operationId, siteId: config.site, state: "draft", revision: 0,
      createdAt: new Date().toISOString(), cleanup: file ? "pending" : "not_needed" }, {
      inputHash: inputHash, sourceId: payload.id || "", action: payload.action, work: Object.assign({ id: id }, fields),
      cleanup: file ? "pending" : "not_needed",
      expectedRevision: payload.expectedRevision, file: job?.file || (file ? Object.assign(file, {
        id: Drive.Files.generateIds({ count: 1, space: "drive", type: "files" }).ids[0], uploaded: false,
      }) : null), updatedAt: new Date().toISOString(),
    });
    job.revision += 1;
    writeArtworkJob_(job);
    return artworkPublicJob_(job);
  });
}
function uploadArtwork_(payload) {
  artworkConfig_();
  return lock_(function () {
    const job = artworkJob_(payload.operationId);
    Core_.requireValue(job.state === "draft" && job.file, "草稿無法接收這份檔案。", "CONFLICT");
    Core_.requireValue(typeof payload.data === "string" && payload.data.length === Math.ceil(job.file.size / 3) * 4, "檔案大小不正確。");
    const bytes = Utilities.base64Decode(payload.data);
    Core_.requireValue(bytes.length === job.file.size && Utilities.base64Encode(bytes) === payload.data &&
      bytesDigest_(bytes) === job.file.sha256 && ArtworkCore_.artworkMime(bytes) === job.file.type, "檔案格式或內容與草稿不符。");
    const folder = artworkFolder_();
    const fields = "id,size,mimeType,md5Checksum,parents,trashed,appProperties";
    const response = driveReferenceResponse_(job.file.id + "?fields=" + fields, true);
    const file = response ? JSON.parse(response.getContentText()) : Drive.Files.create({
      id: job.file.id, name: job.file.name, mimeType: job.file.type, parents: [folder],
      appProperties: { artworkOperation: job.operationId, artworkSite: job.siteId },
    }, Utilities.newBlob(bytes, job.file.type, job.file.name), { fields: fields });
    Core_.requireValue(!file.trashed && file.parents?.includes(folder) && file.appProperties?.artworkOperation === job.operationId &&
      file.appProperties?.artworkSite === job.siteId && Number(file.size) === job.file.size &&
      file.mimeType === job.file.type && file.md5Checksum === bytesDigest_(bytes, Utilities.DigestAlgorithm.MD5),
      "無法確認作品保存結果，請重試同一檔案。", "ATTACHMENT");
    job.file.uploaded = true;
    writeArtworkJob_(job);
    return artworkPublicJob_(job);
  });
}
function publishArtwork_(payload) {
  artworkConfig_();
  const job = lock_(function () {
    const current = artworkJob_(payload.operationId);
    if (current.state !== "draft") {
      if (["failed", "promoted", "stored"].includes(current.state)) {
        current.retryRequested = true;
        writeArtworkJob_(current);
      }
      return current;
    }
    Core_.requireValue(current.revision === payload.revision, "草稿版本已變更。", "CONFLICT");
    Core_.requireValue(payload.publicConfirmed === true && (!current.file || payload.backupConfirmed === true),
      "請確認公開範圍及原檔備份。");
    Core_.requireValue(!current.file || current.file.uploaded, "檔案尚未上傳完成。");
    current.state = "queued";
    current.publicConfirmed = true;
    current.backupConfirmed = payload.backupConfirmed === true;
    current.updatedAt = new Date().toISOString();
    return writeArtworkJob_(current);
  });
  if (["queued", "failed", "stored", "promoted"].includes(job.state)) {
    try { dispatchArtwork_(); }
    catch (error) { return Object.assign(artworkPublicJob_(job), { dispatchPending: true }); }
  }
  return artworkPublicJob_(job);
}

function artworkStoredFile_(job) {
  Core_.requireValue(job.file && job.cleanup !== "cleaned", "作品暫存已清理。", "NOT_FOUND");
  const file = JSON.parse(driveReferenceResponse_(job.file.id + "?fields=id,size,mimeType,parents,trashed,appProperties").getContentText());
  Core_.requireValue(!file.trashed && file.parents?.includes(artworkFolder_()) && file.appProperties?.artworkOperation === job.operationId &&
    file.appProperties?.artworkSite === job.siteId && Number(file.size) === job.file.size && file.mimeType === job.file.type,
    "作品暫存範圍或內容不符。", "ATTACHMENT");
  return file;
}
function artworkChunk_(job, offset) {
  Core_.requireValue(Number.isInteger(offset) && offset >= 0 && offset < job.file?.size && offset % 262144 === 0, "作品區塊位置不正確。");
  artworkStoredFile_(job);
  const end = Math.min(job.file.size - 1, offset + 262143);
  const response = UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/files/" + job.file.id + "?alt=media", {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken(), Range: "bytes=" + offset + "-" + end },
    muteHttpExceptions: true, followRedirects: false,
  });
  Core_.requireValue([200, 206].includes(response.getResponseCode()), "作品區塊下載失敗。", "ATTACHMENT");
  let bytes = response.getBlob().getBytes();
  if (response.getResponseCode() === 200) {
    Core_.requireValue(bytes.length === job.file.size, "作品完整下載大小不符。", "ATTACHMENT");
    bytes = bytes.slice(offset, end + 1);
  }
  Core_.requireValue(bytes.length === end - offset + 1, "作品區塊大小不符。", "ATTACHMENT");
  return { data: Utilities.base64Encode(bytes), size: job.file.size, sha256: job.file.sha256 };
}
function previewArtwork_(payload) {
  return artworkChunk_(artworkJob_(payload.operationId), payload.offset);
}

function deleteArtworkStaging_(job) {
  if (!job.file || job.cleanup === "cleaned") return;
  const existing = driveReferenceResponse_(job.file.id + "?fields=id,parents,appProperties", true);
  if (existing) {
    const file = JSON.parse(existing.getContentText());
    Core_.requireValue(file.parents?.includes(artworkFolder_()) && file.appProperties?.artworkOperation === job.operationId &&
      file.appProperties?.artworkSite === job.siteId, "拒絕清理不屬於此工作的檔案。", "FORBIDDEN");
    Drive.Files.remove(job.file.id);
  }
  job.cleanup = "cleaned";
  writeArtworkJob_(job);
}
function cancelArtwork_(payload) {
  const catalog = ArtworkCore_.mergeArtworks(ARTWORK_BASE_, artworkManifest_("main"), true);
  return lock_(function () {
    const job = artworkJob_(payload.operationId);
    // 版本衝突的失敗草稿也可明確放棄；若 main 仍是這份工作的版本，先恢復發布。
    // 被較新作品取代的歷史不會因清理私人暫存而從 Git 移除。
    const uncommittedFailure = job.state === "failed" && !job.commitSha &&
      !catalog.some(function (work) { return work.operationId === job.operationId; });
    Core_.requireValue((["draft", "cancelled"].includes(job.state) || uncommittedFailure) && payload.confirmed === true,
      "已提交的工作請先重試發布；下架需從作品清單另行操作。", "CONFLICT");
    job.state = "cancelled";
    writeArtworkJob_(job);
    deleteArtworkStaging_(job);
    return artworkPublicJob_(job);
  });
}

function cleanupArtwork_(payload) {
  return lock_(function () {
    const job = artworkJob_(payload.operationId);
    Core_.requireValue(job.commitSha && job.publicConfirmed && (!job.file || job.backupConfirmed), "原檔保存尚未確認。", "CONFLICT");
    verifyArtworkCommit_(job, job.commitSha);
    deleteArtworkStaging_(job);
    return artworkPublicJob_(job);
  });
}
