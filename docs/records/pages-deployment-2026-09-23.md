# 2026-09-23 GitHub Pages 首次發布

使用者已授權將 LanLan Pages 公開至 `kt-productions` 組織並部署網站。倉庫名稱使用不含空白的 `lanlan-pages`，專案顯示名稱保留 LanLan Pages。

- 公開倉庫：[kt-productions/lanlan-pages](https://github.com/kt-productions/lanlan-pages)。
- 正式網站：[LanLan Pages](https://kt-productions.github.io/lanlan-pages/)。
- 首次發布提交：`463b6addb8bfda55472840f81a87c6d264057f95`。
- 首次 [Actions 執行](https://github.com/kt-productions/lanlan-pages/actions/runs/35776179042)：建置、驗證與 Pages 部署均成功。

Pages 使用 GitHub Actions 發布來源，HTTPS 已啟用。`main` 推送後先跑測試及產物檢查，再發布 `dist/`；流程及回退方式見[開發指南](../development/setup.md#github-pages-發布)。設定依 [GitHub 官方 workflow 說明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)，Action 固定至已核對的提交。

## 實際驗證

| 範圍 | 結果 |
| --- | --- |
| 待提交內容 | 首次提交共 336 個檔案，約 134 MB；沒有已知私人管理資源 ID、憑證或超過 100 MiB 的單一檔案。已移出的素材及私人副本未加入提交。 |
| Actions | `npm ci`、48 項離線測試、正式網址建置及 `npm run check` 全部通過；95 件作品、50 筆表單素材來源及 48 款貼圖。 |
| 本機路徑相容 | 沿用既有預覽服務，根路徑及 `/lanlan-pages/` 下的四頁內容均與產物一致；兩個路徑的 MP4 Range 皆回應 206。 |
| 正式 HTTP | 四頁、robots、sitemap、favicon 及首頁模組回應 200；影片 Range 回應 206。四頁 canonical 皆使用正式 HTTPS 網址，sitemap 不含管理頁或本機網址。 |
| 桌機與手機 | Playwright／Chromium，1440×1000 與 390×844；首頁、委託表單、管理頁共六組直接載入及重新整理通過。頁面身分、主要內容、無錯誤覆蓋畫面、無橫向溢出及截圖檢視均通過，沒有 console error／warn 或 HTTP 資源錯誤。 |
| 作品及導覽 | 作品分類可切至貼圖一件，作品放大及關閉正常；手機選單可開啟並前往委託頁。 |
| 委託表單 | 全選 48 款顯示 6,600，第三頁有 16 款，取消全選及切換小動圖說明正常。未提交訂單。 |
| 管理頁 | 保持未登入，管理工作區隱藏，robots 為 noindex；未執行真實登入、管理或通知。 |

本次工作階段未提供專用 Browser 技能，使用既有 Playwright 執行上述瀏覽器檢查，沒有安裝新的專案套件；截圖及診斷輸出保存在專案外。

## 未通過與待完成

進度頁的靜態頁面可正常載入，但正式來源的 GAS API 讀取未通過。實測 `progress.list` 先由 `script.google.com` 重新導向至 `script.googleusercontent.com`，再回到 Web App 的 HTML 頁面；瀏覽器因 CORS 拒絕讀取。另以獨立 HTTP 請求重現非 JSON 回應；加入診斷參數的請求也發生逾時。頁面會顯示無法讀取最新進度的提示，不能把 HTTP 200 或靜態發布成功視為 API 正常。

此項需另行排查 GAS 執行／重新導向及匿名讀取行為。2026-09-23 較早的後端紀錄曾成功讀取匿名進度，該歷史結果不代表本次正式網站驗收通過。

本次沒有修改 GAS 程式、部署版本、Script Properties、Google 分享權限或收件開關。收件維持暫停；後端 `ADMIN_URL` 應設為 `https://kt-productions.github.io/lanlan-pages/admin.html`，Telegram 憑證、名單及真實登入／通知仍待完成。未測試 Safari、Firefox、實體手機或真實送件。
