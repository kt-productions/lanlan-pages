# 2026-09-23 GAS 與多人通知設定

本次使用者要求完成既有 GAS 的後續設定，Telegram 收件通知支援一位或多位指定數字 ID；管理頁未來放在 GitHub Pages，透過 Telegram Login 驗證。使用者後續明確要求待專案確認後再推送 GitHub，因此本次只部署既有 GAS，沒有建立 GitHub 遠端、推送或發布 Pages。

## 已完成

- 更新既有 GAS 專案；7 個雲端來源已從 API 讀回，與本機建置逐檔一致。價格設定與 Auth／Web 登入程式未變更。
- 新增 `TELEGRAM_NOTIFY_USER_IDS`，支援 1–20 位正整數使用者 ID，以半形逗號分隔並去重；與 `ADMIN_TELEGRAM_IDS` 分開。舊 `TELEGRAM_CHAT_ID` 保持相容。
- 每筆訂單首次通知時固定名單，將每位的狀態、次數、時間與非敏感錯誤代碼存入 `notificationRecipientsJson`；重試略過已送達者。個別失敗不丟單，不把 Token、原始回應或例外寫入 Sheet。
- 沒有 `ADMIN_URL` 時，通知省略管理頁連結；登入仍要求有效的 HTTPS 管理頁，不放寬回程驗證。
- 在既有擁有者登入的 GAS 編輯器執行 `setupOrders()`，台北時間 02:43:44 開始、02:43:47 成功完成。從 Sheets `Orders!A1:AD1` 讀回確認 30 欄，尾端為 `isRush`、`isOnHold`、`notificationRecipientsJson`；原表與資料先行備份。
- 部署 Web App 第 1 版：部署者執行、允許匿名呼叫；管理 API 仍由 Telegram 驗證保護。前端僅保存公開 API 網址。
- 保存 GAS `WEB_APP_URL` 與 `content/integration.json` 的 `apiUrl`；`SPREADSHEET_ID` 沿用原表，`DAILY_ORDER_LIMIT=50`，`ACCEPTING_ORDERS=false`。

## 部署位置

- GAS 專案管理連結與 Script ID 另存私人維運清單；本機目標仍由被忽略的 `.clasp.json` 指定。
- 公開 Web App 回呼網址以 `content/integration.json` 的 `apiUrl` 為準。
- 部署對照另存私人維運清單；公開 API URL 仍保留運作所需的部署識別碼。
- 版本：1；說明「2026-09-23 多人通知與七階段進度；暫停收件」。以後更新同一 deployment 的版本，不重新建立無必要的網址。

## 驗證與限制

| 範圍 | 實際結果 |
| --- | --- |
| `npm test` | 48/48 通過；新增多人去重、部分失敗／不明結果、逐位重試、錯誤名單、29 欄升級、寫入中斷保留已送達者與未發布管理頁案例。皆為離線替身，未發真實通知。 |
| 後端與測試語法 | `Orders.gs` 透過標準輸入交給 `node --check`；兩個修改的測試檔亦通過。 |
| `npm run build`、`npm run check` | 產生四頁與 95 件作品，94 支影片、64 筆表單素材、48 款選項及資源／模組／錨點檢查通過。 |
| 真實匿名 API | `progress.list` 成功，回傳 0 筆；`admin.list` 未帶 token 時回傳 `AUTH`。 |
| Google Content Service | HTTP 200、JSON 回應，重新導向至 `script.googleusercontent.com` 成功。 |
| 瀏覽器 | 沿用已在 `127.0.0.1:4173` 執行的預覽與既有 Chrome，1920×855；本機子路徑進度頁讀到真實 0 筆結果，急件篩選回傳空結果；沒有捕獲應用程式 error／warn，沒有橫向溢出。截圖確認頁面與操作狀態正常。沒有啟動新伺服器；未重跑手機版面或完整填單流程。 |
| 訂單與通知 | 未新增真實或測試訂單，未呼叫 Telegram 傳送訊息；收件開關保持 false。 |
| 登入前置檢查 | 本機管理頁點「使用 Telegram 登入」，真實 API 回傳「服務設定尚未完成」，保持未登入，沒有主控台 error／warn；目前未填管理網址，符合預期。 |
| 文件與差異 | 21 份 Markdown 的相對檔案連結與程式碼區塊檢查通過；10 個主要檔案對照修改前備份的 no-index 空白檢查通過。Git status／diff／diff --check／cached diff 已檢視。 |

## 待使用者填入

在上述 GAS「專案設定 → 指令碼屬性」填入 `TELEGRAM_BOT_TOKEN`、`TELEGRAM_NOTIFY_USER_IDS`、`ADMIN_TELEGRAM_IDS`、`TELEGRAM_CLIENT_ID`、`TELEGRAM_CLIENT_SECRET`、`SESSION_SECRET`。不要把 Token 或 Secret 貼至對話。通知名單與管理員可以不同；每位通知對象先對 bot 按 Start。

在 BotFather 的 Login Widget 登記同一個 `/exec` Allowed URL，維持 RS256。等 GitHub Pages 網址確定後再填 `ADMIN_URL`，驗證真實 OIDC 登入、管理編輯、通知與重試。Bot 權限及逐項說明以[服務設定](../development/order-service.md)為主。

## 備份與回復

本次備份保存於專案外私人空間：`remote-before.json` 為更新前 7 個 GAS 檔案；`orders-before.xlsx` 為升級前試算表；`before/` 保存主要本機修改前檔案；`remote-after.json`、`version.json`、`deployment.json` 保存本次部署的可追溯資訊。備份與 OAuth 憑證均不放網站產物或 GitHub。

本機 clasp 的 OAuth 權限不足以直接使用 Sheets API 讀表，因此改由已登入的 Sheets 介面匯出備份、讀取表頭；未擴大 OAuth 範圍。Apps Script 執行身分的既有 Sheets 權限可正常升級表頭及供公開 API 讀取匿名投影。

要停止服務，先保持 `ACCEPTING_ORDERS=false`，需要完全停止 API 時從 GAS「管理部署作業」封存本次 deployment；前端 `apiUrl` 可還原空字串並重新建置。不要刪除訂單表或整份覆蓋舊版 Sheet。舊 27／29 欄後端與目前 30 欄表不完全相容，若要回復程式，先保留最新資料並規劃相容遷移，不直接刪欄或清除通知結果。

開始本次工作時 Git 已初始化，但尚無提交，全部來源仍未追蹤。Git diff 無法代表這些檔案的修改差異，另對照本機備份檢查；未建立提交或推送。其他進度看板任務的既有變更保持原樣。
