# 文件導覽

本目錄依用途分類。專案介紹與快速開始見[專案 README](../README.md)，協作限制見 [AGENTS.md](../AGENTS.md)。

## 設計 · design

- [介面與互動規格](design/interface.md)：色票、字級、斷點、頁面配置、影片互動及設計取捨；設計以文字維護。

## 開發與維護 · development

- [開發指南](development/setup.md)：環境需求、預覽方式、環境變數與發布狀態。
- [架構與內容維護](development/architecture.md)：目錄職責、建置流程、頁面依賴，以及修改內容與新增作品的位置。
- [驗證指南](development/validation.md)：檢查指令的涵蓋範圍、介面驗收項目與結果記錄方式。
- [委託服務設定](development/order-service.md)：後端建置、Script Properties、部署、登入與通知維護。
- [插件配置](development/plugins.md)：專案工具用途與維護原則。
- [公開倉庫與私人資料](development/publication.md)：管理連結、憑證、個人資訊、素材與提交前檢查。

## 規格與來源 · reference

- [委託表單與計價](reference/commission.md)：目前欄位、檔案限制、費率、折扣順序、首頁價目及已確認／未確認差異。
- [JSON 草稿契約](reference/draft-schema.md)：第 3 版草稿的完整欄位、型別、空值與狀態。
- [委託服務契約](reference/order-api.md)：收件、進度、管理 API、Sheet 欄位與登入邊界。
- [作品與素材盤點](reference/assets.md)：原站來源、作品 ID、顯示名稱、精選排序及素材保存位置。
- [原始表單與交付條款](reference/source-forms.md)：原表單存檔、原始交付格式與製作條件；與本站現行規則分開保存。

## 未來規劃 · plans

- [正式收件串接](plans/form-integration.md)：尚待部署驗收、檔案上傳與其他未實作功能。

## 歷史紀錄 · records

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
