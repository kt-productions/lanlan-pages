# LanLan Pages — 爛爛 LANLAN 個人作品集

展示角色動畫、貼圖與小動圖的靜態網站，提供作品瀏覽、委託價目及獨立委託表單。

網站以 GitHub Pages 發布，原始碼位於 [kt-productions/lanlan-pages](https://github.com/kt-productions/lanlan-pages)，正式網址為 [LanLan Pages](https://kt-productions.github.io/lanlan-pages/)。2026-09-23 已完成 Telegram 登入與測試單通知驗證，並部署 GAS 第 4 版、升級 Orders 為 31 欄，匯入 174 筆 Trello 歷史訂單。公開進度改為七欄卡片看板，支援類型、階段與急件／擱置篩選；匯入單沿用原公開名稱，新表單仍匿名。維持暫停收件；沒有檔案上傳或付款。設定與匯入步驟見[服務維護](docs/development/order-service.md)及 [Trello 匯入](docs/development/trello-import.md)。

使用原生 HTML、CSS、JavaScript（ES Modules）與 Node.js 建置。前端沒有第三方執行期套件；Apps Script 後端打包使用 node-forge 驗證登入簽章。

初次發布曾遇到 GAS 重新導向／CORS 問題；後續已驗證真實讀取、登入、通知與更新。仍觀察到偶發 45 秒逾時，出現錯誤時請重新讀取確認結果，勿直接重複送件。歷史背景見[首次發布紀錄](docs/records/pages-deployment-2026-09-23.md)，本次結果見[Trello 看板驗收](docs/records/trello-2026-09-23.md)。

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
