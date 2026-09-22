# 架構與內容維護

網站以原生 HTML、CSS、JavaScript（ES Modules）搭配 Node.js 靜態建置，包含作品集首頁、委託表單、公開進度與管理頁，另有 Apps Script 後端。實作依 `package.json`、`scripts/build.mjs` 與 `src/` 維護；協作與授權規則見 [AGENTS.md](../../AGENTS.md)。

## 目錄與內容更新

| 路徑 | 用途 |
| --- | --- |
| `content/integration.json` | 公開的 Apps Script Web App URL，空值表示未啟用，禁止放憑證 |
| `content/site.json` | 網站資訊、首頁展示價目、原表單來源 URL、社群連結、作品牆精選 ID |
| `content/works.json` | 原站 94 支影片的資料、來源 URL、來源頁、尺寸、長度、位元組與 SHA-256 |
| `content/source-assets.json` | 首頁貼圖總覽原圖的來源紀錄 |
| `content/commission.json` | 站內表單規則、計價、草稿版本、來源、檔案限制、已確認更新與待確認差異 |
| `content/forms/` | 三份原表單內容（貼圖為公開節錄）、小動圖英文版及 48 筆貼圖選項紀錄 |
| `content/form-assets.json` | 50 張使用中表單圖片的來源、檔案大小與 SHA-256 |
| `public/assets/forms/` | 貼圖款式、折扣表及交付規格圖 |
| `public/assets/videos/` | 本機保存的 MP4，不依賴 Wix 外連 |
| `public/assets/posters/` | 網頁縮圖；保留角色完整比例 |
| `public/assets/originals/` | 首頁貼圖總覽 PNG，保留下載原檔 |
| `src/pages/home/` | 首頁 `index.html` 模板、`index.js` 入口與 `home.css` 專用樣式 |
| `src/pages/commission/` | 委託頁 `index.html` 模板、`index.js` 流程入口與 `commission.css` |
| `src/pages/progress/`、`src/pages/admin/` | 公開進度、管理員登入及訂單編輯介面 |
| `src/features/orders/` | API 傳輸、共用驗證與公開投影、進度呈現及後台編輯 |
| `backend/apps-script/` | OIDC 驗證、Sheets 讀寫、版本控制、通知與 API 入口 |
| `build/apps-script/` | 獨立後端打包產物，不進入網站 dist |
| `src/features/portfolio/` | `gallery.js` 分類／分批、`playback.js` 背景播放、`lightbox.js` 檢視器 |
| `src/features/commission/` | 計價、驗證、草稿與表單子功能，見下方依賴說明 |
| `src/shared/` | `navigation.js` 手機選單／年份、`dom.js` 安全的純文字呈現、`styles.css` 共用樣式 |
| `src/templates/` | 四頁共用的 `head.html`、`icons.html`、`header.html`、`footer.html` |
| `scripts/` | `build.mjs`、`check.mjs`、`serve.mjs` 及 `build-backend.mjs` 命令入口 |
| `scripts/lib/` | `paths.mjs` 專案根目錄與路徑界線、`content.mjs` JSON／款式解析、`templates.mjs` 跳脫與模板替換 |
| `tests/` | Node.js 內建測試：計價、草稿、欄位、建置工具、API、Apps Script 模擬與真實 RSA 簽章測試 |
| `.editorconfig` | UTF-8、LF、兩格縮排、檔尾換行及移除行尾空白 |
| `docs/` | 分類文件；入口見[文件導覽](../README.md) |

修改首頁價目或聯絡方式：編輯 `content/site.json`；委託規則由 `content/commission.json` 管理，表單介面在 `src/pages/commission/index.js` 與 `src/pages/commission/index.html`。不要另外修改建置 HTML。

增加作品：放入 MP4 與 WebP 縮圖，在 `content/works.json` 新增一筆，沿用既有欄位；ID 必須唯一，category 使用 `animation` 或 `chibi`，尺寸、長度與雜湊必須反映實際檔案。精選順序由 `site.json` 的 `featured` 決定。貼圖總覽目前由建置腳本加入。

作品名稱、精選清單與首屏素材的對應見[作品與素材盤點](../reference/assets.md)。修改原表單內容、費率或草稿時，分別參照[表單規格](../reference/commission.md)、[來源存檔](../reference/source-forms.md)及[草稿契約](../reference/draft-schema.md)，保留來源與目前規則的區別。

## 建置與頁面依賴

`scripts/build.mjs` 讀取內容 JSON，排序作品、加入貼圖總覽，排除尚待確認的貼圖選項並解析款式價格，再組合 HTML 模板與共用導覽。主要導覽為「首頁、委託表單、委託進度」，管理入口置於頁尾。

四頁先載入共用 `src/shared/styles.css`，再載入各頁 CSS 與 `index.js`。首頁入口串接分類、背景播放及檢視器；委託頁入口管理類型、步驟、條件欄位及下載。四頁都匯入共用導覽，首頁不載入委託欄位資料或委託模組，委託頁也不載入首頁樣式及影片控制。

委託功能分工：`pricing.js` 是與 DOM 無關的純計價，`draft.js` 把 FormData 整理成計價輸入及第 3 版快照，`validation.js` 提供檔案／聯絡檢查與繁中欄位提示。`reference.js` 管理本機 Object URL，`stickers.js` 管理款式分頁與選取，`estimate.js` 更新桌機／手機預估，`review.js` 呈現確認快照。所有金額仍由 `estimateCommission()` 計算，沒有第二套公式。

設定中的商用倍數、急件、第二角色及檔案上限直接用於動態提示；HTML 的固定選項說明與 `rules` 仍是需要在費率變更時一併核對的文案，不是額外的計價來源。

建置先讀內容、解析有效款式，再組合共用模板及頁面。`templates.mjs` 統一處理 HTML 跳脫、script 內 JSON 跳脫及缺少佔位欄位的錯誤；來源格式無法解析時停止，不悄悄捨棄款式。

網站建置輸出 `dist/`：頁面為 `index.html`、`commission/index.html`、`progress/index.html` 與 `admin/index.html`；來源 JS／CSS 依資料夾原貌複製至 `assets/site/<內容版本>/`，不打包 HTML 模板。`scripts/lib/site-assets.mjs` 對完整 JS／CSS 檔名與內容計算版本；巢狀模組變動時整個模組樹取得新網址，避免瀏覽器快取造成新舊程式混用。另產生各頁標題與 canonical、sitemap、robots、404 及 `.nojekyll`。不要手改產物；下一次建置會重新產生。

例如首頁腳本網址為 `assets/site/<內容版本>/pages/home/index.js`，其中的 `../../shared/navigation.js` 由模組檔案所在位置解析；作品 `./assets/videos/...` 則由 HTML 頁面位置解析。來源移入 `pages/` 不代表網站網址也多了一層。`npm run check` 會檢查模組匯入及 JS／CSS 產物與來源是否一致。

`public/` 會複製到產物，既有建置仍排除 `.gif`；`docs/` 不打包。2026-09-23 依使用者要求移除未開放及未使用素材，原始副本移至專案外；網站動畫使用 MP4。不要把私人來源副本放回 `public/`。

## 執行與資料邊界

內部資源及跨頁連結使用相對路徑，支援根路徑與 `/lanlan-pages/` 子路徑。四頁可以直接開啟及重新整理，沒有 SPA 路由依賴；預覽設定見[開發指南](setup.md)。

前端維持靜態架構；沒有付款、分析追蹤、Cookie、遠端字型或第三方播放器。管理員透過 Telegram OIDC 登入 Apps Script，訂單保存在 Google Sheets。媒體保存在本機；延後載入、暫停、減少動態與無 JavaScript 時的呈現見[設計規格](../design/interface.md)。

送出前的委託資料留在頁面記憶體，重新整理清除；草稿不含檔案本體。設定後由 Apps Script 驗證並保存訂單，公開 API 只回傳匿名投影，管理 API 每次驗證工作階段與白名單。`submission.js` 管理冪等重試，`contract.js` 與 `pricing.js` 同時打包到後端，避免兩套規則。設定見[委託服務設定](order-service.md)，資料見[服務契約](../reference/order-api.md)。

2026-09-22 依使用者要求完成此次分類，來源與產物路徑對照、實際驗證及回復副本見[重構紀錄](../records/refactor-2026-09-22.md)。

2026-09-23 依使用者要求，公開網址使用 `/`、`commission/`、`progress/` 與 `admin/`；頁內錨點保持相對於當頁，子頁資源使用 `../` 回到網站根目錄。建置另保留舊 `.html` 入口，由 `src/templates/redirect.html` 轉址並保留 query／fragment；直接開啟任何 `index.html` 也會轉至所在目錄，包含首頁。GitHub Pages 會將缺少結尾 `/` 的目錄網址重新導向到含 `/` 的網址。
