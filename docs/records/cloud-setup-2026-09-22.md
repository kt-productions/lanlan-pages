# 2026-09-22 雲端資源設定

本次依使用者指示啟用委託服務的雲端資源。網站仍供本機預覽，尚未發布前端；保持暫停收件。先前程式功能與介面驗收見[委託服務驗證](orders-2026-09-22.md)。

## 資源與已完成設定

| 項目 | 本次結果 |
| --- | --- |
| Drive 資料夾 | LanLan Pages（管理連結另存私人維運清單），由資源擁有者管理；兩項新資源均已移入。 |
| Google Sheets | 爛爛 LANLAN｜委託訂單（管理連結另存私人維運清單），新建，Orders 的 27 個表頭已建立、首列已凍結。 |
| Apps Script | 爛爛 LANLAN｜委託服務 GAS（管理連結另存私人維運清單），新建獨立專案，已上傳後端來源。 |
| 基本 Script Properties | `SPREADSHEET_ID` 已指向上述新表；`ACCEPTING_ORDERS=false`；`DAILY_ORDER_LIMIT=50`。 |
| Google 授權 | clasp 登入完成，Apps Script API 已開啟；使用者另已親自完成 GAS 首次執行授權。 |
| Web App | 部署設定已備妥；使用者選擇「先保留設定，暫不部署」，尚未建立 `/exec` 網址。 |
| Telegram bot | 使用者指定既有 `@KTProductionsBot`；尚未設定憑證及通知目的地。 |
| 前端連線 | `content/integration.json` 的 `apiUrl` 仍為空，沒有連至雲端服務。 |

資源建立後透過 Drive 介面移動，未變更分享設定。Sheet 的父資料夾另經 Drive API 核對。GAS 初始建立成功後，clasp 下載初始內容遇到本機路徑檢查；沿用已建立的 Script ID 設定 `.clasp.json`，沒有重複建立專案或停用路徑保護。

## 設定與保護

- clasp 鎖定 `3.4.1`，使用獨立 `lanlan-pages` 登入設定；未加入前端相依套件。
- `.clasp.json` 沿用既有忽略規則，僅包含 Script ID 與 `build/apps-script` 路徑；新增 `.claspignore` 明確限定 7 個部署檔案。
- OAuth 憑證與非機密啟用狀態存於專案外，由維護者私下保存位置；不放專案、不輸出憑證內容。
- 工具授權採專案管理、部署、Web App 部署、`drive.file` 與帳號電子郵件辨識；未為搬移資料夾擴大成全 Drive 權限，改用使用者已登入的 Drive 介面。
- 遠端初始 manifest 與程式、文件修改前副本已另存專案外私人備份；公開文件不記錄個人保存位置。當時目錄尚未初始化 Git，使用逐檔差異檢查。

## 部署時發現與驗證

Apps Script 編輯器實際顯示 Orders 檔案「沒有函式」，因原初始化函式名稱以底線結尾。新增 `setupOrders()` 手動入口並檢查執行身分；原本保留資料與表頭不符即停止的邏輯不變。為身分核對新增 `userinfo.email` 執行權限，沒有新增初始化 HTTP action。

- 初次上傳及初始化修正後的 7 個檔案均已從 Apps Script API 讀回，核對與本機建置內容一致。
- 修正後執行 `npm test`：37/37 通過，涵蓋初始化的匿名拒絕、不同執行者拒絕、重跑保留訂單與錯誤表頭停止。
- 修改的 Apps Script 及測試 JavaScript 語法檢查通過。
- 修正後，雲端編輯器已可選取 `setupOrders`。首次授權提示由使用者親自審閱完成；2026-09-22 20:38（台北時間）執行記錄顯示成功完畢。
- 在 Sheets 介面選取 `Orders!A1:AA1` 讀回並核對 27 個表頭，確認首列凍結，分享狀態為「僅限我使用」。
- 本次沒有更改前端介面，未重跑先前瀏覽器驗收；Google 授權與 Orders 初始化已在雲端確認，Telegram 與 Web App 串接尚未驗收。

## 尚待完成

1. 依使用者決定暫不部署 Web App。待使用者恢復部署後，才建立公開端點、取得 `/exec`、保存 `WEB_APP_URL`，並在 BotFather 登記相同 Allowed URL。預備設定為部署者執行、所有人存取、保持停止收件，已記錄於本機 `setup-state.json`；尚未送出的部署表單已取消，未建立部署版本。
2. 將 Bot Token、OIDC Client ID／Secret 與獨立 `SESSION_SECRET` 直接保存到 Script Properties；不貼至對話或網站。
3. 確認通知 Chat ID、管理員 Telegram 數字 ID，以及尚未決定的正式管理頁 `ADMIN_URL`。
4. 確認測試目的地後驗收真實登入、拒絕非管理員、收件／重試、通知及進度；通過後另行決定開放收件與前端發布。

後續操作以[委託服務設定](../development/order-service.md)為主；本文件保留本次設定的時間背景。
