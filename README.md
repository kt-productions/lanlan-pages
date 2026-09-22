# LanLan Pages — 爛爛 LANLAN 個人作品集

展示角色動畫、貼圖與小動圖的靜態網站，提供作品瀏覽、委託價目及獨立委託表單。

網站以 GitHub Pages 發布，原始碼位於 [kt-productions/lanlan-pages](https://github.com/kt-productions/lanlan-pages)。正式網址為 [LanLan Pages](https://kt-productions.github.io/lanlan-pages/)。Apps Script Web App 已於 2026-09-23 部署第 1 版，前端已連線，Orders 已升級為 30 欄，維持暫停收件。後端支援指定一位或多位 Telegram 使用者收件通知，以及管理員登入、訂單編輯和七階段公開工作看板；Telegram 憑證與 ID 名單尚待填入，真實通知與登入尚未驗收。2026-09-23 使用者已授權公開倉庫與部署；後端 `ADMIN_URL` 應使用正式管理頁網址，仍待維護者完成設定。參考素材使用 HTTPS 連結，沒有檔案上傳或付款。

使用原生 HTML、CSS、JavaScript（ES Modules）與 Node.js 建置。前端沒有第三方執行期套件；Apps Script 後端打包使用 node-forge 驗證登入簽章。

首次發布驗證中，GAS 進度讀取遇到重新導向／CORS 錯誤，尚不能正常顯示工作清單。Pages 靜態網站已發布；此後端問題及驗證範圍見[發布紀錄](docs/records/pages-deployment-2026-09-23.md)。

網站入口使用目錄網址：[委託表單](https://kt-productions.github.io/lanlan-pages/commission/)、[委託進度](https://kt-productions.github.io/lanlan-pages/progress/)、[委託管理](https://kt-productions.github.io/lanlan-pages/admin/)。舊 `.html` 網址會自動轉址，`index.html` 會回到所在目錄。

## 快速開始

需要 Node.js 22 以上。在專案根目錄執行：

```sh
npm ci
npm run dev
```

建置完成後開啟 <http://127.0.0.1:4173/lanlan-pages/>。修改來源後需重新建置並重新整理瀏覽器；完整指令與環境設定見[開發指南](docs/development/setup.md)。代理啟動預覽前須遵守協作準則的授權規則。

## 文件

- [文件導覽](docs/README.md)：依設計、開發、規格與來源、未來規劃、歷史紀錄分類。
- [委託服務設定](docs/development/order-service.md)：Sheets、Telegram、管理員白名單與啟用驗收。
- [公開倉庫與私人資料](docs/development/publication.md)：雲端資源、憑證、文件與素材的保存界線。
- [協作準則](AGENTS.md)：開發、驗證、素材保留與發布界線。
- [程式碼架構](docs/development/architecture.md)：頁面、功能模組、共用模板與測試的維護位置。

## 權利

網站程式碼與作品未授予開源或再利用授權。作品著作權屬繪師及各角色權利人所有。
