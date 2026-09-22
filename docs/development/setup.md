# 開發指南

使用 Node.js 22 以上；前端沒有第三方執行期套件；請先執行 `npm ci` 安裝後端打包用 node-forge。本機預覽不需憑證，外部設定見[委託服務設定](order-service.md)。所有指令在 LanLan Pages 根目錄執行。

## 本機預覽

```sh
npm run dev
```

此指令先建置，再啟動 <http://127.0.0.1:4173/lanlan-pages/>。委託頁為 <http://127.0.0.1:4173/lanlan-pages/commission/>。伺服器也支援根路徑，專案子路徑用來模擬 GitHub Pages。

預覽只監聽 `127.0.0.1`，沒有熱更新。修改 `src/`、`content/` 或網站素材後，另外執行 `npm run build` 並重新整理瀏覽器。代理啟動服務前須依 [AGENTS.md](../../AGENTS.md) 取得授權。

## 建置與預覽既有產物

```sh
npm run build
npm run preview
```

`npm run build` 重新產生 `dist/`，不啟動伺服器；`npm run preview` 只提供既有產物，不會自動建置。需要執行哪些檢查及其限制，見[驗證指南](validation.md)。

## 環境變數

| 名稱 | 使用時機 | 預設值與用途 |
| --- | --- | --- |
| `PORT` | 啟動預覽服務時 | `4173`；只改變預覽埠。 |
| `SITE_URL` | 建置時 | `http://127.0.0.1:4173/lanlan-pages/`；產生四頁 canonical 與 sitemap 等網址。 |

更換 `PORT` 不會自動更換建置的 `SITE_URL`；需要兩者一致時，應在建置前設定網址。環境變數由目前 shell 提供，專案沒有要求建立 `.env`。

## 後端建置

`npm run build:backend` 產生 `build/apps-script/`，不啟動或部署服務。價格、欄位驗證或後端有修改時需重新打包並更新部署版本。網站只設定公開的 `content/integration.json`，憑證全部放 Apps Script Script Properties。

## GitHub Pages 發布

2026-09-23 使用者已授權公開倉庫及部署：

- 倉庫：[kt-productions/lanlan-pages](https://github.com/kt-productions/lanlan-pages)，預設分支 `main`。
- 網站：[LanLan Pages](https://kt-productions.github.io/lanlan-pages/)。
- 管理頁：[委託管理](https://kt-productions.github.io/lanlan-pages/admin/)；仍需完成後端 `ADMIN_URL` 與 Telegram 設定。

`.github/workflows/pages.yml` 在推送 `main` 或手動執行時，使用 Node.js 24 執行 `npm ci`、`npm test`、`npm run build`、`npm run check`。全部通過後，才上傳 `dist/` 並部署至 `github-pages` environment。後端打包產物、文件與私人設定不在 Pages artifact 內。

倉庫的 Pages 建置來源須設為 GitHub Actions。建置 `SITE_URL` 取自 `actions/configure-pages` 的 `base_url`，產生正式 canonical、sitemap 與 404 返回首頁網址；本機預設不變。部署工作才取得 `pages: write` 與 `id-token: write` 權限，各 Action 固定至已核對的提交。

部署狀態與失敗原因可從倉庫 Actions 的「部署 GitHub Pages」查看。修正後推送，或對相同提交重新執行 workflow；需要回退時以新的 revert 提交還原至確認過的內容，不直接手改 `dist/`。

GAS Web App 獨立部署，Pages 發布不會上傳 GAS 程式或修改 Script Properties；維持暫停收件。登入及通知仍須依[委託服務設定](order-service.md)完成驗收。網站資料公開前的界線見[公開倉庫與私人資料](publication.md)。
