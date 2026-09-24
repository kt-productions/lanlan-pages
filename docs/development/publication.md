# 公開倉庫與私人維運資料

本文件記錄 2026-09-23 使用者確認的公開前整理方式。同日使用者後續已授權推送 `kt-productions/lanlan-pages` 並部署 GitHub Pages；後續曾依使用者要求開啟收件，歷史依據見[收件紀錄](../records/receiving-2026-09-23.md)；維護前仍須核對實際設定，文件本身不授權變更。發布方式見[開發指南](setup.md#github-pages-發布)。

## 資料放置原則

| 資料 | 保存與公開方式 |
| --- | --- |
| 程式碼、資料契約、屬性名稱與設定步驟 | 放公開倉庫；範例使用虛構值，不填入實際憑證。 |
| 網站 API `/exec` URL | `content/integration.json` 的 `apiUrl` 是前端必須知道的公開端點。可保留；不能當成密碼或管理權限。 |
| Drive 資料夾、訂單 Sheet、GAS 編輯專案的 ID／管理連結 | 放專案外的私人維運清單，公開文件只描述用途。GAS 目標由被忽略的 `.clasp.json` 保存，Sheet ID 由 Script Properties 保存。 |
| Bot Token、OIDC Secret、SESSION_SECRET | 僅放受控的後端 Script Properties；不放前端、文件、GitHub 或對話。GAS 編輯者限真正需要維護的人員。 |
| clasp OAuth 憑證 | 使用各維護者自己的授權，存在專案外；不共享憑證檔。 |
| 通知／管理員 ID 名單、訂單、匯出資料與備份 | 存在受控後端或專案外私人空間；不放公開倉庫、網站產物或公開 Issue。 |
| 個人電腦資訊 | 文件不記錄帳號目錄、絕對工作路徑、暫存副本位置或個人插件安裝狀態；使用專案相對路徑及操作時提供的環境變數。 |
| 提交者信箱 | 使用者已確認可以公開，保留既有 Git 身分。 |

資源 ID 與管理 URL 本身不是登入憑證；從文件移除是減少不必要揭露，實際保護仍靠存取權限。Drive 資料夾與訂單 Sheet 應設定為「受限制」，只加入需要的 Google 帳號；一起檢查上層資料夾的繼承權限。發布前由擁有者確認，目前整理沒有讀取或變更雲端 ACL。[Google Drive 分享說明](https://support.google.com/drive/answer/2494822)

沿用既有 GAS Script Properties 管理執行設定，公開文件只列名稱與用途。Properties 是程式可讀的設定儲存區，不是對 GAS 編輯者隱藏密鑰的隔離區，因此也要限制專案編輯權。[Google Properties Service](https://developers.google.com/apps-script/guides/properties)

私人維運清單至少記錄資源用途、擁有者、管理連結、部署版本、憑證保管方式、備份與回復步驟。使用受控的私人文件或密碼管理器保存，不把它提交至此倉庫；歷史公開前整理的私人副本不列入此文件。API 的部署 ID 已包含於公開 URL，無需因它可見就重新部署或更換網址。

## 素材與來源紀錄

公開專案只保留目前網站使用的素材。依使用者決定，未開放款式與未使用素材已從專案移除；移除前的原檔、來源 JSON、文件及雜湊清單保存在專案外副本。現有 48 款價格、94 支影片、95 張縮圖、貼圖總覽、兩張說明圖及 favicon 保持不變。

`content/forms/stickers-source.json` 是明確標註的公開節錄，排除未開放款式及與規格無關的文字；其他來源差異仍保留，不把歷史費率改寫成現行規則。素材權利不因倉庫公開而轉為開源或再利用授權。

## 提交前檢查

1. 確認待提交檔案沒有私人維運清單、憑證、訂單、下載草稿、截圖中的登入資訊或個人路徑。
2. 執行 `npm run build`、`npm run check`；款式或計價資料有變動時執行 `npm test`。檢查 `dist/` 也沒有未使用或未開放素材。
3. 檢視 `git status --short`、`git diff` 及實際暫存內容。`.gitignore` 只防止未追蹤檔案被一般加入流程帶入，不能移除既有提交；不要對私人檔案使用強制加入。
4. 新增素材需核對頁面引用、來源及雜湊。備份放專案外，不把副本再次放回公開目錄。

若憑證曾真正進入公開提交，先撤銷／輪替，再評估歷史清理；只刪除目前檔案不足以移除歷史。歷史整理結果見[公開前紀錄](../records/publication-cleanup-2026-09-23.md)；一般文件核對不等同完整憑證或安全稽核。[GitHub 敏感資料移除說明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
