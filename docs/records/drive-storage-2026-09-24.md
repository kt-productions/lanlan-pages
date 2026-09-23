# LanLan Pages Drive 資源整理紀錄（2026-09-24）

依使用者指定，LanLan Pages 的 Google Drive 資源統一放在 `乾太工作室 KT Productions/LanLan Pages` 下。

## 已完成

- 在 Drive 介面將既有「作品發布暫存」資料夾移入指定目錄，保留原資料夾 ID、檔案及私人權限。
- 確認指定目錄顯示「作品發布暫存」，Drive 根目錄不再有同名資料夾。
- GAS 使用 Script Property `LANLAN_PAGES_DRIVE_FOLDER_ID` 保存指定目錄 ID；值不寫入公開 repo。
- 新增共用父目錄驗證。`setupArtworkStorage()` 與 `setupReferenceStorage()` 建立新資源時指定此父目錄，讀取既有資源時核對直接隸屬、資料夾型別及應用程式標記。
- 作品與委託附件的檔案驗證都先取得通過父目錄檢查的子資料夾，因此資源被移到其他位置時會停止處理，避免把檔案寫回錯誤目錄。

## 維護規則

新增 LanLan Pages 的 Drive 資源時，先把父目錄設定為這個 ID，再以對應的初始化函式建立並保存子資料夾 ID。不可在 Drive 根目錄另建同名替代資料夾，也不可把私人資料夾公開分享。更換父目錄前必須先完成資源搬移、Script Property 更新及初始化驗證，否則既有附件與作品暫存會被視為設定錯誤。
