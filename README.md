# LanLan Pages — 爛爛 LANLAN 個人作品集

展示角色動畫、貼圖與小動圖的靜態網站，提供作品瀏覽、委託價目及獨立委託表單。

網站以 GitHub Pages 發布，原始碼位於 [kt-productions/lanlan-pages](https://github.com/kt-productions/lanlan-pages)，正式網址為 [LanLan Pages](https://kt-productions.github.io/lanlan-pages/)。2026-09-23 已完成 Telegram 登入與測試單通知驗證，並部署 GAS 第 13 版、升級 Orders 為 32 欄，匯入 174 筆 Trello 歷史訂單。公開進度目前為六欄卡片看板，支援類型、階段與急件／擱置篩選；匯入單沿用原公開名稱，新表單改為顯示暱稱；封存工作不出現在公開進度，後台只在「封存」篩選顯示。2026-09-23 已依使用者要求開啟收件；已加入五檔私人附件與 Telegram 多圖相簿通知，沒有付款功能；附件發布與驗收狀態見[附件紀錄](docs/records/attachments-2026-09-23.md)。設定與匯入步驟見[服務維護](docs/development/order-service.md)及 [Trello 匯入](docs/development/trello-import.md)。

使用原生 HTML、CSS、JavaScript（ES Modules）與 Node.js 建置。前端沒有第三方執行期套件；Apps Script 後端打包使用 node-forge 驗證登入簽章。

已修復後台登入的回應傳遞問題：正式網頁採用 GAS Html Service 通訊，部署資源使用內容版本，避免快取混用。修復後兩次 Telegram 登入、175 筆讀取、搜尋、歷史來源與附件、測試單儲存及公開同步、內容還原、登出均已實測；174 筆歷史訂單逐欄一致，通知未重發。結果不明的修改仍應先重新讀取。驗收範圍及工具限制見[後台驗收](docs/records/admin-2026-09-23.md)，早期問題見[首次發布紀錄](docs/records/pages-deployment-2026-09-23.md)。

Telegram 登入現改由另一個視窗驗證，完成後原管理頁自動登入；視窗受阻時保留原分頁手動回程。實作與驗證範圍見[自動登入紀錄](docs/records/login-popup-2026-09-23.md)。

2026-09-24 GAS 已更新至第 14 版，管理登入自核發起固定有效 3 天（72 小時），同一瀏覽器重新整理、關閉網頁或重開瀏覽器後可還原。主動登出、到期或後端確認管理權限已移除時清除登入；瀏覽器禁止保存網站資料時會提示只能使用本頁登入。僅保存 token 與到期時間，不保存委託資料；更新前已建立的登入仍沿用原期限，重新登入後才採 3 天。

首頁價目加入小字 NT$，貼圖包顯示 NT$ 50 ~ 250 起；表單價格區間統一使用 ~，角色動畫確認為新台幣。驗證見[價格格式紀錄](docs/records/price-format-2026-09-23.md)。

Telegram 收件通知已包含完整表單內容與伺服器預估明細；長文自動分段，多張圖片維持一組相簿，補送只處理未成功的部分。正式驗證見[完整通知紀錄](docs/records/notification-text-2026-09-23.md)。

委託進度與管理看板預設只載入未交稿；已交稿欄內提供「載入已交稿」按鈕，按下才補載，重新載入回到未交稿。搜尋與篩選會提示目前的資料範圍，詳見[按需載入驗收](docs/records/delivery-loading-2026-09-23.md)。

委託進度已移除卡片的「訂單資訊」展開區。委託管理改為同樣的六欄看板，點「編輯」開啟保留原功能的彈跳視窗；完整資料搜尋、篩選、未儲存確認與手機版驗收見[管理看板紀錄](docs/records/admin-board-2026-09-23.md)。

網站入口使用目錄網址：[委託表單](https://kt-productions.github.io/lanlan-pages/commission/)、[委託進度](https://kt-productions.github.io/lanlan-pages/progress/)、[委託管理](https://kt-productions.github.io/lanlan-pages/admin/)。舊 `.html` 網址會自動轉址，`index.html` 會回到所在目錄。

2026-09-24 首頁小動圖分類改為桌機每列四張、每批八張；委託看板合併「草稿確認/等待付款」，卡片依原始建立時間由舊到新排列。管理頁預設小動圖，移除上方工作階段篩選，支援拖曳移欄；編輯視窗仍保留階段選擇。急件卡片紅底、擱置藍底，並存時加紅色側框。GAS 已更新至第 15 版，前端由本次 `main` 推送觸發 GitHub Pages 發布；驗證與發布範圍見[本次紀錄](docs/records/gallery-form-2026-09-24.md)。

2026-09-24 作品放映室改按使用者確認的編號由大到小排列，並更新歡迎文案；貼圖包新增一份表單限同一角色的說明、調整修改條款及準備提示，聯絡與參考素材標籤同步更新。草稿與計價契約不變，驗證見[作品排序與表單文案紀錄](docs/records/gallery-form-2026-09-24.md)。

2026-09-24 首頁中央影片改為使用者提供的「逼餔撩髮」，原 6 MB GIF 另存為約 182 KB MP4，保留 1 秒循環、原影格節奏與完整比例；原檔保留。重建方式見[影片壓縮與延遲載入](docs/development/video-optimization.md)。

## 快速開始

需要 Node.js 22 以上。在專案根目錄執行：

```sh
npm ci
npm run dev
```

建置完成後開啟 <http://127.0.0.1:4173/lanlan-pages/>。修改來源後需重新建置並重新整理瀏覽器；完整指令與環境設定見[開發指南](docs/development/setup.md)。代理啟動預覽前須遵守協作準則的授權規則。

## 文件

- [作品上傳與資源管理提案](docs/plans/artwork-upload.md)：規劃繪師自助上傳、私人原檔、公開展示及自動發布；尚未實作。
- [影片壓縮與延遲載入](docs/development/video-optimization.md)：可見時載入小尺寸預覽，點開才載入大尺寸壓縮版，原始檔保留供後續操作。
- [文件導覽](docs/README.md)：依設計、開發、規格與來源、未來規劃、歷史紀錄分類。
- [委託服務設定](docs/development/order-service.md)：Sheets、Telegram、管理員白名單與啟用驗收。
- [公開倉庫與私人資料](docs/development/publication.md)：雲端資源、憑證、文件與素材的保存界線。
- [協作準則](AGENTS.md)：開發、驗證、素材保留與發布界線。
- [程式碼架構](docs/development/architecture.md)：頁面、功能模組、共用模板與測試的維護位置。

## 權利

網站程式碼與作品未授予開源或再利用授權。作品著作權屬繪師及各角色權利人所有。

頁尾分別標示「Artworks © 2026 爛爛 and respective rights holders.」與「Developed and maintained by 乾太.」，年份沿用自動更新；開發維運署名不另行宣告網站程式的權利歸屬。
