# 文件導覽

本目錄依用途分類。專案介紹與快速開始見[專案 README](../README.md)，協作限制見 [AGENTS.md](../AGENTS.md)。

## 設計 · design

- [介面與互動規格](design/interface.md)：色票、字級、斷點、頁面配置、影片互動及設計取捨；設計以文字維護。

## 開發與維護 · development

- [作品管理與發布](development/artwork-service.md)：作品草稿、Drive 暫存、GitHub App、main 保存核對及 production 部署；正式啟用步驟與限制。
- [參考附件](development/reference-attachments.md)：五檔上傳、私人 Drive 儲存、後台預覽及 Telegram 圖片通知。

- [影片壓縮與延遲載入](development/video-optimization.md)：預覽版、展示版、原始檔保存，以及新增作品後的壓縮與驗證指令。
- [開發指南](development/setup.md)：環境需求、預覽方式、環境變數與發布狀態。
- [架構與內容維護](development/architecture.md)：目錄職責、建置流程、頁面依賴，以及修改內容與新增作品的位置。
- [驗證指南](development/validation.md)：檢查指令的涵蓋範圍、介面驗收項目與結果記錄方式。
- [委託服務設定](development/order-service.md)：後端建置、Script Properties、部署、登入與通知維護。
- [插件配置](development/plugins.md)：專案工具用途與維護原則。
- [公開倉庫與私人資料](development/publication.md)：管理連結、憑證、個人資訊、素材與提交前檢查。

## 規格與來源 · reference

- [委託表單與計價](reference/commission.md)：目前欄位、檔案限制、費率、折扣順序、首頁價目及已確認／未確認差異。
- [JSON 草稿契約](reference/draft-schema.md)：第 4 版草稿的完整欄位、型別、空值與狀態。
- [委託服務契約](reference/order-api.md)：收件、進度、管理 API、Sheet 欄位與登入邊界。
- [作品與素材盤點](reference/assets.md)：原站來源、作品 ID、顯示名稱、精選排序及素材保存位置。
- [原始表單與交付條款](reference/source-forms.md)：原表單存檔、原始交付格式與製作條件；與本站現行規則分開保存。

## 未來規劃 · plans

- [繪師作品上傳與資源管理](plans/artwork-upload.md)：多站 Drive 暫存、main 保存與 production 發布的原始設計及取捨；實作與啟用另見維護文件。
- [正式收件串接](plans/form-integration.md)：目前串接狀態與尚未實作功能。

## 歷史紀錄 · records

- [2026-09-24 作品管理本機驗收](records/artworks-2026-09-24.md)：上傳／草稿／發布、清理及 Git 重試、四種媒體處理、桌機手機與正式串接限制。
- [2026-09-23 完整 Telegram 通知](records/notification-text-2026-09-23.md)：完整欄位、長文分段、相簿及逐段重試與正式傳送驗證。

- [2026-09-23 暱稱與封存](records/archive-2026-09-23.md)：公開暱稱、封存篩選與解除、32 欄升級及資料保留驗證。

- [2026-09-23 開啟收件](records/receiving-2026-09-23.md)：GAS 收件開關、設定持久化及正式表單入口確認。
- [2026-09-23 管理看板與編輯視窗](records/admin-board-2026-09-23.md)：公開卡片簡化、管理七欄看板、完整分頁及編輯視窗的桌機／手機驗收。
- [2026-09-23 後台驗收](records/admin-2026-09-23.md)：登入回應與部署快取修復、正式讀寫及登出驗收、前後資料比對，也保留初次失敗證據與工具限制。
- [2026-09-23 Trello 看板與移轉](records/trello-2026-09-23.md)：174 筆匯入、封存與附件保留，以及公開看板和時間欄位驗收。
- [2026-09-23 GitHub Pages 首次發布](records/pages-deployment-2026-09-23.md)：公開倉庫、部署及桌機／手機驗證，並記錄 GAS 進度讀取的限制。
- [2026-09-23 公開前整理](records/publication-cleanup-2026-09-23.md)：私人資訊、素材移出、忽略規則與實際驗證。
- [2026-09-23 GAS 與多人通知設定](records/service-setup-2026-09-23.md)：既有 GAS 第 1 版部署、30 欄升級、多人通知重試、匿名 API 驗證與待填設定。
- [2026-09-22 雲端資源設定](records/cloud-setup-2026-09-22.md)：新試算表、GAS、資料夾位置、上傳驗證與尚待完成的授權及 Telegram 設定。
- [2026-09-22 委託服務驗證](records/orders-2026-09-22.md)：收件、登入、編輯、匿名進度的離線測試與瀏覽器驗收，以及正式部署前的限制。
- [2026-09-23 公開工作看板](records/progress-2026-09-23.md)：七階段、急件／擱置、完整資料篩選、舊 Sheet 相容與本機驗收。
- [2026-09-22 程式碼分類與重構驗證](records/refactor-2026-09-22.md)：目錄對照、互動修正、來源摘要、素材保留及此次測試結果。
- [2026-09-22 驗收與文件核對](records/verification-2026-09-22.md)：當時的瀏覽器結果、文件核對及未驗證範圍；不能代替目前版本的驗收。

## 文件維護方式

README 保留專案簡介與入門入口。操作步驟寫在 development，介面規格寫在 design，現行資料契約與來源盤點寫在 reference，未實作方案寫在 plans，帶日期的查核結果寫在 records。同一份費率、欄位或來源清單只在對應主文件完整維護，其他文件以連結引用。

文件需區分現行規則、原始來源、未來方案及歷史結果。現行規則以程式碼、內容設定與使用者已確認決策為準；原始存檔不回寫為新規則，歷史驗收需保留日期與限制。

Markdown 連結依所在文件解析；行內程式碼中的 `src/`、`content/`、`docs/` 等專案路徑皆相對於專案根目錄。建置後的頁面網址另依預覽服務的根路徑或 `/lanlan-pages/` 子路徑解析。
