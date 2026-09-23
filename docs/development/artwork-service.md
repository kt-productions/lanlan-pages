# 作品管理與發布服務

2026-09-24：已加入程式與離線驗證，尚未設定正式 GitHub App、初始化正式作品儲存或切換 production 部署。啟用狀態須以實際雲端設定與成功執行紀錄為準。[設計背景](../plans/artwork-upload.md)。

## 繪師操作

管理員使用既有 Telegram 登入，在管理頁切換「作品管理」。可依名稱、分類尋找作品，新增 PNG／JPG／GIF／MP4，填寫名稱、替代文字及說明，預覽後儲存草稿。草稿保存在私人工作表，檔案只上傳作品專用私人 Drive 資料夾。

「儲存並發布」要求確認公開範圍；含上傳檔案時另確認已保留原檔副本，並同意遠端 Git 保存核對成功後永久刪除這次暫存。確認不預先勾選。Git repo 必須是公開作品倉庫，main 推送成功就已公開，與網站部署是否完成分開。

既有作品可只修改文字，不必重傳。選擇新檔即可建立替換版本；已保存草稿的檔案固定，需換另一檔時可放棄草稿後重新編輯。上傳回應中斷可重試同一檔；重新開啟未完成上傳的草稿時，重新選取原檔即可接續。按「下架作品」後確認發布，部署成功才從作品集移除；Git 歷史、舊原始來源與委託表單款式仍保留。

草稿與發布紀錄分別顯示排隊、處理、已保存、待部署、已上線及失敗。失敗工作可重試；尚未記錄提交、且不是 main 現行版本的失敗工作可以明確放棄，已保存工作需先恢復發布，再從作品清單下架。清理失敗可按「重試清理暫存」，不必重新發布；已放棄但清理失敗的草稿保留「重試清理草稿」。清單保留最近 50 份紀錄，未完成或待清理的舊工作仍持續顯示。後台顯示 main 的已保存版本，縮圖使用固定 commit 的公開 Git 原始檔網址，避免尚未部署的素材產生失效預覽；訪客作品集仍只讀 Pages。

## 資料與程式分工

| 位置 | 責任 |
| --- | --- |
| `src/features/artworks/` | 共用驗證、作品管理表單、預覽、篩選與發布狀態。 |
| `content/artworks.json` | 公開作品覆寫清單；每件保留穩定 ID、revision、工作識別、文字、下架狀態及媒體雜湊。既有 `works.json` 與貼圖總覽作為原始基底。 |
| `public/assets/artworks/<作品 ID>/<來源 SHA-256>/` | 核可公開的原檔、靜態縮圖與展示版本；原檔位元組不變。 |
| `ArtworkJobs` Sheet | 兩欄 `operationId`、`recordJson`；私人草稿、上傳 ID、公開及備份確認、處理狀態、Git SHA 與清理紀錄。不修改 Orders。 |
| `Artworks.gs` | 管理 API、草稿版本、Drive 暫存、配號與清理。 |
| `ArtworkGitHub.gs` | App JWT／短效 token、dispatch、固定 commit 讀取及原檔核對。 |
| `ArtworkWorker.gs` | 簽章驗證、持久租約、領取工作、回報保存／發布／失敗。 |
| `scripts/artwork-worker.mjs` | 下載、轉檔、測試、建置、提交 main、請求清理、快轉 production。 |
| `scripts/artwork-deployment.mjs` | 核對 production 事件版本、網站 release.json 及回報上線。 |

管理 API 均使用既有管理 token：`admin.artworks.list`、`save`、`upload`、`publish`、`preview`、`cancel`、`cleanup`。草稿使用固定 UUID 與 revision，發布後不可修改該工作；下一次編輯建立新工作並提供作品 expectedRevision。文字欄位只取白名單，ID 由伺服器配發，表單不能指定 repo、分支或 Drive 路徑。

`artworks.worker` 使用獨立 HMAC-SHA256；簽署 `<timestamp>.<nonce>.<body>`，body 包含 siteId、操作與工作內容。接受五分鐘內的請求，後續操作須持有目前有效的工作租約。租約以 Script Properties 持久保存，預設十分鐘，runner 每分鐘續期。佇列保存在 Sheet，不依賴 Actions concurrency 的待執行數量。重試依狀態、工作 ID 與租約去重；簽章請求不公開到前端或日誌。

## 設定 GitHub App

在 GitHub 建立並安裝 App 到指定公開 repo，設定 repository permissions：

- **Actions：Read and write**，供 GAS 啟動作品 workflow，及相同 SHA 的部署重試。
- **Contents：Read and write**，供 runner 同步 production；GAS 換取的 token 會再縮限為 Contents read。
- 若維護者要由 App 發布包含 workflow 變更的版本，另核對 GitHub 對 Workflows write 的要求；作品工作本身只提交清單與受管素材。

不需讓繪師登入 GitHub，也不需要 GitHub OAuth 回呼或 webhook。GAS 與 Actions 各自換取 installation access token，不把 token 作為 workflow input。App 私鑰下載後直接保存到後端與 GitHub Secrets，不放程式碼、對話或公開文件。

同一 App 可安裝多個 repo；每站使用獨立 GAS／Sheet、Drive 暫存、worker secret 與站點 ID。每次換取 token 明確指定一個 repo；不要把 A 站的站點設定或 worker secret 放到 B 站。

## GAS 設定

沿用現有 Script ID 與 Web App URL。先執行 `npm run build:backend`，檢查部署檔案；`.claspignore` 已加入五個作品程式檔。部署方法沿用[委託服務](order-service.md)，不用增加 Drive 權限，仍使用 `drive.file`。

在 Script Properties 設定：

| 名稱 | 用途 |
| --- | --- |
| `ARTWORKS_ENABLED` | 初期保持 `false`；完成資源與驗證後改成 `true`。 |
| `ARTWORK_SITE_ID` | 本站固定小寫識別，例如 `lanlan`。 |
| `ARTWORK_GITHUB_REPO` | 本站的 `owner/repo`。 |
| `ARTWORK_GITHUB_APP_ID` | App 的數字 ID。 |
| `ARTWORK_GITHUB_INSTALLATION_ID` | 安裝到該帳號的 installation ID。 |
| `ARTWORK_GITHUB_PRIVATE_KEY` | App PEM 私鑰；支援 PKCS#1／PKCS#8 及實際換行。 |
| `ARTWORK_WORKER_SECRET` | 獨立的至少 32 字元密碼學亂數，與 Actions 保存同一值；不得沿用登入密鑰。 |
| `ARTWORK_FOLDER_ID` | 由初始化函式建立，不手動改成委託附件資料夾。 |

由專案編輯者執行 `setupArtworkStorage()`，建立 `ArtworkJobs` 與專用私人資料夾；重跑保留資料，未知表頭停止。函式不接受匿名 HTTP 初始化。既有 `SPREADSHEET_ID`、Telegram 設定與 Orders 不需重建。

## GitHub 設定與切換順序

Repository Secrets：`ARTWORK_API_URL`（既有 GAS `/exec`）、`ARTWORK_WORKER_SECRET`、`ARTWORK_APP_PRIVATE_KEY`。

Repository Variables：`ARTWORK_SITE_ID`、`ARTWORK_APP_ID`、`ARTWORK_INSTALLATION_ID`、`ARTWORK_SITE_URL`（含結尾 `/` 的正式網站網址）、`ARTWORKS_ENABLED`（初期 `false`）。名稱與 GAS 的對應略有不同，依上列分別設定。

1. 先完成來源審閱、離線驗證、App／Secrets／Variables 與 GAS 新版本，保持作品功能未啟用。
2. 把已驗證程式提交到 main。此版本開始，`validate.yml` 驗證 main，`pages.yml` 只發布 production；正式網站維持前次部署內容，直到第一次 production 發布成功。
3. GitHub Pages 發布來源維持 **GitHub Actions**；確認 `github-pages` environment 允許 production，檢查 main／production 分支規則允許預期機器人動作。若規則要求 PR，先配合規則完成工作流，不能繞過保護。
4. 由維護者將 production 建立或快轉至該筆已驗證的 main SHA；不要單獨在 production 修改檔案，也不用 force push。這次以維護者或 App 憑證推送，觸發 Pages；確認正式四頁與 `release.json`。
5. 完成作品儲存初始化後，啟用 GAS 與 repo 的 `ARTWORKS_ENABLED=true`。在核可的測試環境使用虛構作品驗證完整發布、原檔保存及暫存清理，再使用正式作品。

`artworks.yml` 支援 GAS 的 workflow_dispatch；每十五分鐘的排程接續未完成的排隊工作，每次最多五件。main 必須是預設分支，workflow 檔也須存在於 main。一般 main 人工提交不自動發布，要更新正式程式時，驗證指定 SHA 後同樣快轉 production。

處理工作用內建 GITHUB_TOKEN 推送 main，因此必要測試與建置在該工作內執行；production 使用 App token 推送，以啟動部署 workflow。部署固定 checkout 事件 SHA，過期發布在 deploy 前略過。相同 SHA 重推不會產生新 push，所以重試時明確 dispatch `pages.yml`；若 production 已包含較新版本，重試該現行版本，不退回舊工作 SHA。

## 清理與失敗處理

原檔與作品清單同一 commit 保存。runner 先完成測試、建置與產物檢查，再推送 main；GAS 再確認 commit 位於遠端 main 歷史、工作欄位及版本一致，並透過 Git blob 下載原檔核對大小與 SHA-256，保存 commit SHA 後才可清理。

清理只處理該工作的檔案 ID，核對專用資料夾、站點及 operation 標記，使用逐檔永久刪除，不清空帳號垃圾桶。另有原檔備份與公開確認才執行。刪除已成功但回報中斷時，重試接受該指定 ID 已不存在；其他未知檔案一律不刪。

清理失敗不阻擋發布，後台保留待清理狀態。推送成功但回報失敗時，runner 由 Git commit 的 `Artwork-Operation` 找回 SHA。Drive 清理後再發生同步或部署失敗，從 Git 重試，不要求重新上傳。production 分歧時停止，不改寫歷史；處理差異後再重試。

## 第一版限制與驗證

- 每檔 10 MiB、每站待處理工作最多 30 件、暫存預留總量 200 MiB；同帳號其他 Drive 使用量仍可能影響上傳。草稿不自動到期刪除。
- GIF 最長 15 秒／450 格，MP4 最長 120 秒／7,200 格；尺寸最多 8,192 × 8,192 且不超過 4,000 萬像素。轉檔使用受限執行時間及記憶體配置，原檔保持位元組不變。
- PNG／JPG 另產生縮圖及展示 PNG；MP4 產生 640／1280 長邊 H.264 展示版本；GIF 保留原動態及透明度，用靜態縮圖顯示卡片，減少動態或暫停時檢視器使用縮圖。
- 作品清單目前需小於 900,000 bytes；發布產物設 900 MiB 預留上限。Git 歷史會持續占用容量，下架不抹除歷史。
- 官方 GAS 通道、Google 帳號配額、GitHub App 權限、分支規則與真實 Pages 發布，需在設定後實測；離線測試不代表雲端已啟用。

驗證指令：`npm test`、`npm run test:media`（需 FFmpeg／ffprobe；沿用 `FFMPEG_PATH`、`FFPROBE_PATH`）、`npm run build`、`npm run check`。新增測試涵蓋權限、App JWT、重送、上傳中斷、衝突、租約、遠端雜湊、清理及重試；Git 快轉測試使用暫存本機 bare repo，媒體整合測試使用虛構色塊，無外部寫入。

本機驗證環境、結果及正式串接限制見[2026-09-24 作品管理驗收](../records/artworks-2026-09-24.md)。

## 官方依據

[GitHub App installation token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation)、[workflow_dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)、[Actions 觸發規則](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)、[Drive 分段下載](https://developers.google.com/workspace/drive/api/guides/manage-downloads)。
