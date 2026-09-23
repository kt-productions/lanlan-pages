# 作品管理實際流程驗收（2026-09-24）

依使用者回報「新增作品沒有儲存按鈕」及要求實際驗證整個流程，在正式後台以標示「系統流程測試、非繪師作品」的自製測試圖驗收。使用者已確認暫時公開、Git 保存後清除此測試圖的 Drive 暫存，以及驗收後下架；本機備份與 Git 歷史保留。

## 發現與修正

- 作品 dialog 沿用了外框裁切，表單卻未套用委託編輯表單的高度限制。1920 × 911 視窗中，儲存按鈕原本落在 y=1206，超出可視區；補上表單 flex 排版與視窗高度後，按鈕落在 y=814–868，內容區獨立捲動。
- 390 × 844 手機直向中，新增視窗一開啟即可看到「儲存草稿／儲存並發布」，按鈕位於 y=763–817，無橫向溢出。844 × 390 橫向亦保留操作列及可捲動內容。
- 正式發布首次執行發現 Google Content Service 的一次性結果網址偶發先回傳 404，重讀再轉回 GAS 入口。原版本無法取回已領取的工作；原檔仍留在 Drive，尚未產生作品 commit。
- GAS 第 19 版加入原 claim nonce 取回租約、五分鐘短期完成收據；Actions 在四分鐘上限內最多重送三次相同 HMAC 請求。不同 nonce／負載／runner 不能取代現有租約，已確認的業務錯誤不自動重試。先部署相容後端，再更新客戶端。

## 已完成檢查

- 正式後台讀取 95 件既有作品，新增 PNG、預覽、儲存私人草稿、關閉後重開、從 Drive 讀回 640 × 360 圖片、修改草稿文字再儲存成功。
- JPG、GIF、MP4 透過實際檔案選擇器逐一選取，圖片可解碼，MP4 讀到 640 × 360、1 秒及可播放狀態；這三份預覽沒有另存雲端草稿。
- 四種格式的 FFmpeg 整合測試通過，核對原檔位元組未變、衍生檔可解碼及清單可重建。
- 143 項 Node.js 測試、語法、建置、產物與差異檢查通過。新增案例涵蓋 POST 回應遺失、結果票證失效、相同簽章重送與跨租約保護。
- [修正後 main 驗證](https://github.com/kt-productions/lanlan-pages/actions/runs/35907853515)及[production 部署與 GAS 回報](https://github.com/kt-productions/lanlan-pages/actions/runs/35907929926)成功。

## 公開發布流程

測試工作已由後台送出並觸發 GAS 的 GitHub App dispatch；首次 Actions 在領取回應失效處停止。修正後[接續工作](https://github.com/kt-productions/lanlan-pages/actions/runs/35908308316)成功，沒有重傳或重複建立草稿。

- 新作品為 `chibi-58`，初次提交 `40d0fc359b3e7e50826f1f96fdba82a690498919`。從遠端 Git 取回的原檔為 5,604 bytes，SHA-256 為 `b5df7187e88085151df1bc94cea72628a3ec9b934bcc7473b35daa7354debdfd`，與本機備份一致。
- 清理前在 Drive 作品專用資料夾看見測試 PNG；遠端核對後重新整理確認資料夾清空，既有委託附件不在清理範圍內。
- GitHub App bot 快轉 production，觸發 [push 部署](https://github.com/kt-productions/lanlan-pages/actions/runs/35908485087)成功。正式 release.json 對應上述提交；實際作品集能開啟測試圖，圖片解碼為 640 × 360，後台顯示「已上線」。

- 已發布作品的名稱與說明修改，由 [GAS 觸發的文字更新工作](https://github.com/kt-productions/lanlan-pages/actions/runs/35908710005)完成；提交 `2e62b5944ac87e9ab6d9d1fe6b2c01278d2b4d07` 只有 `content/artworks.json` 變動，revision 升為 2，三份媒體檔不變。[部署](https://github.com/kt-productions/lanlan-pages/actions/runs/35908875676)成功後，實際重整作品集並開啟大圖，確認新名稱與說明已生效。

- [下架工作](https://github.com/kt-productions/lanlan-pages/actions/runs/35909097006)及[下架部署](https://github.com/kt-productions/lanlan-pages/actions/runs/35909274199)成功。提交 `7011359ea68c010ac6f528edd6a6e1fbbdcc6db1` 將 revision 升為 3、標記 deleted，移除目前受管目錄中的三份測試素材，保留原始 Git 歷史。
- 正式 release.json 對應下架提交。實際重整作品集確認找不到測試作品，小動圖恢復 57 件，後台恢復 95 件；Drive 暫存資料夾再次確認為空。下架成功的後台紀錄顯示「已下架」，與新增／文字更新的「已上線」區分。

本次實際公開串接使用 PNG；JPG、GIF、MP4 完成真實選檔預覽與離線轉檔，未分別暫時公開。驗收沿用既有登入，不新增測試訂單、不操作委託內容、不發送 Telegram 通知；大容量壓力、第二個繪師站點與災難還原不在本次範圍。
