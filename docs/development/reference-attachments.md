# 參考附件設定與維護

2026-09-23 依使用者需求實作五檔上傳、選填素材連結、後台預覽／下載及 Telegram 圖片通知。部署與實測狀態見[附件驗收](../records/attachments-2026-09-23.md)，資料契約見[服務 API](../reference/order-api.md)。

## 初始化

1. 備份既有 GAS 來源、部署設定及 Orders；核對雲端沒有其他修改。
2. 執行 `npm test`、`npm run build`、`npm run check`，推送 `build/apps-script` 到既有專案。新增 `Attachments.gs`、`AttachmentNotifications.gs`，manifest 啟用 Advanced Drive v3 及 `https://www.googleapis.com/auth/drive.file`。
3. 由原部署帳號在 Apps Script 選 `Attachments.gs`、執行 `setupReferenceStorage`，親自審閱 Google 新增權限。此入口核對執行身分，建立「爛爛 LANLAN｜委託附件」私人資料夾並保存 `REFERENCE_FOLDER_ID`；再次執行只核對資料夾，不重複建立。不可將別的資料夾 ID 隨意填入。
4. 初始化完成後，在 Drive 將同一個「爛爛 LANLAN｜委託附件」資料夾移到 `乾太工作室 KT Productions/LanLan Pages/`，保持私人存取及原 `REFERENCE_FOLDER_ID`；不要建立替代資料夾或擴大 Drive 權限。現行初始化先建立在根目錄，搬移由資源擁有者的 Drive 介面完成；既有設定再次執行只核對，不會重新建在根目錄。
5. 權限完成後再次執行並確認成功，再建立新版本更新既有 Web App 部署。同步發布第 4 版前端，第三版舊分頁仍可使用原有連結收件，重新整理後才會提供新版附件功能；更舊版本收到 `VERSION` 時須重新整理。保留目前收件狀態與所有訂單。

`drive.file` 僅允許應用程式建立或獲授權的檔案，沒有要求整個 Drive 的讀寫權限；資料夾不公開分享。Advanced Service 使用預設 Google Cloud 專案時會自動啟用 API；若專案改用自訂 Cloud 專案，需由維護者啟用 Drive API。參考 [Drive 權限](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)及 [Apps Script 進階服務](https://developers.google.com/apps-script/guides/services/advanced#enable_advanced_services)。

## 通知與容量

每筆委託先傳完整填單文字，再傳相簿／檔案；文字過長會分段，實作及逐段重試見[服務 API](../reference/order-api.md#完整表單通知)。通知沿用既有 Bot Token、收件 ID 與管理員設定；不需要新的 Telegram 群組權限。每位收件人必須先對 bot 按 Start。兩至五張 PNG／JPEG／WebP 以 `sendMediaGroup` 合併成一組相簿，只有首張附委託編號、類型、數量及後台入口；單張維持圖片通知。GIF 單檔以動畫傳送，其他格式單檔以文件傳送；多個其他格式合併為文件群組。圖片與文件混合時分組，因 Telegram 不接受兩者混在同一相簿。非圖片與不能預覽的格式可由後台下載原檔。

每單最多五檔、每檔 10 MiB、合計 45 MiB，採逐檔上傳；合計限制為 GAS 的 50 MB UrlFetch 請求上限保留相簿 multipart 空間。Drive 空間及 Apps Script 配額依部署帳號計算。通知失敗不影響已成立訂單；後台「重試通知」只補未確認成功的文字段落、檔案或收件人，已成功相簿不重送。明確拒絕圖片的 400 回應才將整組改傳文件群組，結果不明不自動改送。通知量較多時會先保留待送狀態，需由後台接續；沒有新增排程。限制見 [Telegram 相簿](https://core.telegram.org/bots/api#sendmediagroup)及 [Apps Script 配額](https://developers.google.com/apps-script/guides/services/quotas)。

## 資料保留與故障復原

- 開始送件後的檔案可能已保存，但尚未產生訂單；填單者應保留原分頁並重試。預留 ID 讓中斷重試沿用原檔，不能要求客戶反覆重新填單。
- `REFERENCE_UPLOAD_` 屬性與未完成檔案不會自動刪除。定期由維護者核對預留、Orders `requestId` 及 Drive `appProperties.lanlanRequest`；取得資料處理授權後，才將確定不需要的未完成檔案移至垃圾桶並清除對應預留。不要批次清掉所有預留或刪除已成立訂單附件。Properties 容量有限，長期未維護可能導致新上傳失敗。
- `REFERENCE_FOLDER_ID` 應保持不變；更換會讓舊附件完整性檢查失敗。不要將私人資料夾改為公開連結，以免洩漏角色設定。
- 舊版本只在使用者瀏覽器預覽的圖片從未上傳，無法事後從 Sheets 還原；需要原委託者重新提供。原有 HTTPS 素材連結及 Trello 附件連結保持可用。
- 回復舊部署時同步回復前端版本，保留 Drive 檔案、屬性、Sheets 附件中繼資料與歷史；不可用舊空白資料表覆蓋正式資料。
