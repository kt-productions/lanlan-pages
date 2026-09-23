// LanLan Pages 的所有私人 Drive 資源都必須放在這個指定父資料夾下。
const LANLAN_PAGES_FOLDER_MIME_ = "application/vnd.google-apps.folder";

function lanlanPagesDriveFolder_() {
  const id = setting_("LANLAN_PAGES_DRIVE_FOLDER_ID");
  Core_.requireValue(/^[A-Za-z0-9_-]+$/.test(id),
    "LanLan Pages Drive 上層資料夾設定不正確。", "CONFIG");
  return id;
}

function verifyLanlanPagesDriveFolder_() {
  const id = lanlanPagesDriveFolder_();
  const folder = JSON.parse(driveReferenceResponse_(id + "?fields=id,mimeType,trashed").getContentText());
  Core_.requireValue(!folder.trashed && folder.mimeType === LANLAN_PAGES_FOLDER_MIME_,
    "LanLan Pages Drive 上層資料夾設定不正確。", "CONFIG");
  return id;
}
