# 作品管理正式啟用紀錄（2026-09-24）

依使用者「正式啟用並代為操作」的指示，已完成以下設定；此紀錄接續[作品功能本機驗收](artworks-2026-09-24.md)，早期未啟用的描述保留為歷史背景。

## 正式設定

- 建立工作室專用 GitHub App，只安裝到 `kt-productions/lanlan-pages`，授予 Actions／Contents 讀寫與必要 Metadata 讀取。Webhook 與使用者 OAuth 不啟用。
- App 私鑰、獨立 worker secret 及站點設定已分別存入 GAS Script Properties 與 GitHub Secrets／Variables；私鑰未進入公開來源。實際換取的 installation token 已核對只有本站 repo。
- 初始化 `ArtworkJobs` 與作品專用私人 Drive 暫存資料夾；前後逐值比較既有 Orders，178 筆資料一致。未發送 Telegram 通知。
- GAS Web App 更新至第 18 版，保留原部署網址、執行身分、存取設定與原有屬性。正式版本不包含本次暫時使用的擁有者初始化檢查程式。
- `main` 執行來源驗證，`production` 執行 Pages 部署；`github-pages` environment 只允許 production。首次以維護者建立 production，後續作品由 App 正常快轉，不使用 force push。
- GAS 與 repo 的 `ARTWORKS_ENABLED` 均已設為 `true`。日後維護程式須先驗證 main，再將 production 快轉至指定版本；只推 main 不會更新網站。

## 實際驗證

- 整合已發布的導覽修正後，139 項 Node.js 測試、四種媒體實際轉檔、建置與產物檢查通過；後續傳輸修正增加兩項測試，共 141 項通過。未發布的收益報表修改未包含於本次部署。
- [main 雲端驗證](https://github.com/kt-productions/lanlan-pages/actions/runs/35903523382)與[首次 production 部署](https://github.com/kt-productions/lanlan-pages/actions/runs/35903652206)成功。正式 `release.json` 對應 `fe0c899e3a973b363cd1ca7e978cc90bffe65b24`。
- 本機送出的有效 HMAC 工作請求可連上正式 GAS，回傳空佇列；使用 App token 的 Actions dispatch 已接受。匿名作品管理請求遭 `AUTH` 拒絕。
- 第一次雲端工作收到 HTML 而非 JSON，未處理任何作品。依 [Content Service 轉址規則](https://developers.google.com/apps-script/guides/content#redirects)，改為明確以無負載 GET 取得 Google 結果、最多重讀三次，禁止向其他網域轉送，也不重送可能已執行的 POST；錯誤不輸出原始 HTML 或結果網址。修正後[141 項雲端驗證](https://github.com/kt-productions/lanlan-pages/actions/runs/35904469414)與[空佇列作品 Actions](https://github.com/kt-productions/lanlan-pages/actions/runs/35904470414)均成功。持續網路失敗仍會安全停止，不能保證外部服務永不失敗。
- 正式後台沿用原登入，成功讀取 95 件作品，證明 GAS 可使用 App 私鑰讀取公開作品版本。桌機與 390 × 844 手機尺寸檢查清單與新增視窗，無相關主控台錯誤及橫向溢出。

## 驗收界線

首次啟用時尚未在正式作品集發布虛構作品，也未清理正式 Drive 測試檔；當時的空佇列、清單及視窗檢查不能視為完整公開發布驗收，亦未驗證操作列可達性。使用者隨後回報新增作品按鈕被裁切並要求完整實測，確認測試圖可暫時公開、清理及下架；後續已修正操作列與 Google 結果遺失處理，部署 GAS 第 19 版並完成實際串接，結果見[完整流程驗收](artwork-flow-2026-09-24.md)。

第二個繪師網站、帳號總容量管理與備份還原演練不在本次啟用範圍。
