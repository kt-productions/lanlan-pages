# 委託服務設定與維護

本文件描述目前程式的設定與維護方式，不把歷史部署版本當成即時狀態。Telegram 登入、收件、附件與通知已各有正式驗收紀錄；最近可追溯的部署背景及待發布項目見[現況與決策對照](current-state.md)。管理入口為 `admin/`，收益檢視為 `admin/?view=revenue`；作品服務另見[作品管理](artwork-service.md)。

## 服務組成

登入自核發起固定有效 72 小時，由 `Auth.gs` 以持久屬性保存 token 雜湊對應紀錄。OAuth／票證使用短期快取，與工作階段分開；到期、撤銷及瀏覽器保存規則見下方「維護與限制」。

草稿確認與等待付款合併顯示，舊值仍相容；公開與管理資料依原始建立時間由舊到新，Trello 採來源卡片建立時間。看板預設只載入未交稿，已交稿按需補載；收益報表另讀完整訂單快照。

進度頁是六欄卡片看板，附加急件／擱置旗標。`setupOrders()` 只追加已知舊表缺少的欄位：第 28／29 欄工作旗標、第 30 欄通知名單、第 31 欄 `sourceJson`、第 32 欄 `isArchived`。不刪除原欄位、訂單或歷史。相容映射見[服務契約](../reference/order-api.md)，歷史資料操作見[Trello 匯入維護](trello-import.md)。

靜態網站提供五個頁面目錄與收益檢視，入口見[README](../../README.md#功能與入口)。Google Apps Script Web App 負責驗證、重新計價、Sheets 讀寫、Telegram OIDC 登入及收件通知；Google Sheets 的 `Orders` 保存委託、通知狀態與修改歷史。試算表不要公開分享。

Telegram 同一個 bot 可兼任登入與通知。登入只要求 `openid profile`，不要求電話或透過登入授予私訊權限；通知分別發給 `TELEGRAM_NOTIFY_USER_IDS` 指定的一位或多位使用者，每位必須先對 bot 按 Start。通知名單與管理員白名單分開。參考素材可上傳最多五檔或提供 HTTPS 連結；附件保存在程式建立的私人 Drive 資料夾，不變更分享權限。新增授權與維護見[參考附件](reference-attachments.md)。

## 產生部署程式

在專案根目錄執行：

```sh
npm ci
npm run build:backend
npm test
```

`build/apps-script/` 包含 `Auth.gs`、`Bridge.gs`、`Orders.gs`、`Attachments.gs`、`DriveStorage.gs`、`AttachmentNotifications.gs`、`NotificationText.gs`、`Import.gs`、`Web.gs`、`Core.gs`、`Config.gs`、`Forge.gs`，以及作品服務的 `ArtworkCore.gs`、`ArtworkBase.gs`、`Artworks.gs`、`ArtworkGitHub.gs`、`ArtworkWorker.gs`，另有 `appsscript.json` 與第三方授權文字。既有雲端專案以本機 `.clasp.json` 的 `scriptId` 連結，`rootDir` 為 `build/apps-script`；`.claspignore` 僅允許上述 17 個 `.gs` 與 manifest 上傳。不要重複建立雲端專案。授權文字保存在部署副本，不是 Apps Script 程式檔。作品服務的獨立設定與啟用順序見[作品管理與發布](artwork-service.md)，部署時須一併核對共用 `DriveStorage.gs`，不可漏傳；`tests/backend-build.test.mjs` 會檢查打包與上傳白名單。

部署工具使用鎖定的 `@google/clasp@3.4.1`。各維護者使用自己的授權，將專案外憑證檔路徑及登入設定名稱分別提供給 `LANLAN_CLASP_AUTH`、`LANLAN_CLASP_USER` 環境變數；實際值不寫入文件，不複製其他人的憑證：

```powershell
if (-not $env:LANLAN_CLASP_AUTH -or -not $env:LANLAN_CLASP_USER) {
  throw '請先設定自己的 clasp 憑證路徑與登入設定名稱。'
}
npm exec --yes --package @google/clasp@3.4.1 -- clasp --auth "$env:LANLAN_CLASP_AUTH" --user "$env:LANLAN_CLASP_USER" show-file-status
npm exec --yes --package @google/clasp@3.4.1 -- clasp --auth "$env:LANLAN_CLASP_AUTH" --user "$env:LANLAN_CLASP_USER" push
```

推送前先確認目標 Script ID、遠端修改與備份；`push` 只更新原始碼，不會自動更新已發布 Web App 的版本。manifest 變更需審閱，不以 `--force` 忽略未知差異。無法使用 clasp 時，可在既有 Apps Script 專案建立同名程式檔、貼上建置內容並更新 manifest。

`Core.gs`、`Config.gs` 來自共用驗證、計價與內容 JSON，不能在雲端另改價格。後端使用鎖定的 `node-forge@1.4.0` 驗證 RS256；不加入前端、不從 CDN 載入、不使用其亂數產生器。版本與完整性由 `package-lock.json` 鎖定，授權見 `node_modules/node-forge/LICENSE` 及部署副本，更新後須重跑簽章測試。

## Script Properties

在 Apps Script「專案設定 → 指令碼屬性」設定以下值。憑證只放此處，不放網站 JSON、公開倉庫或對話。

| 屬性 | 內容 |
| --- | --- |
| `SPREADSHEET_ID` | 專用 Google Sheets ID；部署帳號需有編輯權限。 |
| `REFERENCE_FOLDER_ID` | 執行 `setupReferenceStorage` 自動建立的私人附件資料夾；不要手動換成別的資料夾。 |
| `LANLAN_PAGES_DRIVE_FOLDER_ID` | `乾太工作室 KT Productions/LanLan Pages` 的唯一 Drive 父資料夾；附件資料夾必須是它的直接子資料夾。 |
| `TELEGRAM_BOT_TOKEN` | 通知用 bot 的 Token。 |
| `TELEGRAM_NOTIFY_USER_IDS` | 1–20 位收件者的正整數 Telegram 使用者 ID，以半形逗號分隔，例如虛構的 `123456789,987654321`；重複 ID 只送一次。不是 username，不必都是管理員。 |
| `TELEGRAM_CHAT_ID` | 舊版相容：只有 `TELEGRAM_NOTIFY_USER_IDS` 空白時才使用。新設定請用上一列，不必填此項。 |
| `TELEGRAM_CLIENT_ID` | BotFather Login Widget 提供的 Client ID，保持字串。 |
| `TELEGRAM_CLIENT_SECRET` | OIDC Client Secret，與 Bot Token 不同。 |
| `ADMIN_TELEGRAM_IDS` | Telegram 數字使用者 ID，以半形逗號分隔；不是 username 或 OIDC `sub`。 |
| `SESSION_SECRET` | 密碼學亂數產生、至少 32 字元的獨立密鑰，用於登入隨機值衍生。 |
| `WEB_APP_URL` | 正式 `https://script.google.com/macros/s/…/exec`，不使用 `/dev`。 |
| `ADMIN_URL` | GitHub Pages 管理頁的完整 `https://…/admin/`，保留專案子路徑，不帶 query 或 fragment。未發布時留空；通知略過後台連結，但登入仍要求此項。 |
| `ACCEPTING_ORDERS` | 僅字串 `true` 開放新收件，省略或其他值均停止新收件。 |
| `DAILY_ORDER_LIMIT` | 選填；滾動 24 小時收件上限，預設 50。另限制同聯絡方式每小時 3 筆。 |

可在自己的終端機產生密鑰，輸出直接保存到 Script Properties，不要貼回對話：

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

首次初始化時先保持 `ACCEPTING_ORDERS=false`；既有環境維護前先核對實際開關及[收件紀錄](../records/receiving-2026-09-23.md)，不要為了更新程式重新初始化或改動營運設定。在 Apps Script 編輯器選取 `Orders.gs`，從函式清單執行 `setupOrders`，由資源擁有者核准權限；它會建立空白表頭或追加已知舊版缺少的旗標與通知欄位，不清空資料。未知表頭或待追加欄位已有資料／公式時停止，不可直接覆寫。

底線結尾的 `setupOrders_` 不會出現在編輯器函式清單，故由 `setupOrders` 作為手動入口。入口透過 [Session 介面](https://developers.google.com/apps-script/reference/base/session)核對 Google 活躍使用者與實際授權使用者，拒絕匿名或身分不符的呼叫，也沒有加入 HTTP API action。manifest 所需權限為 `drive.file`、Sheets 讀寫、對外連線及 `userinfo.email`（僅初始化身分檢查），與 clasp 管理專案的 OAuth 授權分開。程式不記錄或回傳 Google 電子郵件地址。

## 部署與登入設定

1. Apps Script 建立 Web App 部署，執行身分為部署者，存取範圍允許未登入 Google 的訪客。這讓前台能收件與讀取公開進度；管理操作仍由 Telegram 驗證保護。Workspace 若禁止此設定，先處理帳號政策，不能關閉管理驗證。
2. 將正式 `/exec` URL 填入 `WEB_APP_URL`。更新時優先更新既有 deployment 的版本；若網址改變，同步 BotFather 與前端設定。
3. BotFather mini app → bot → Login Widget → Allowed URLs，登記**與 `WEB_APP_URL` 完全一致的回呼網址**；Advanced 維持 **RS256**。本站採 OIDC 重新導向，沒有在各靜態頁嵌入 widget，因此 Telegram 回呼在 Apps Script；多站共用 bot 時，各部署回呼均須登記。
4. `ADMIN_URL` 指向正式管理頁。按登入後，Telegram 驗證在另一個視窗開啟，完成後原管理頁自動登入並關閉驗證視窗；若視窗無法關閉，直接回原管理頁即可。瀏覽器阻擋彈出視窗時改用原分頁登入，仍須在 GAS 回程頁點「返回管理後台」。回程票證不能交給另一個瀏覽器或分頁使用。
5. 在 `content/integration.json` 的 `apiUrl` 填入 `/exec` URL，設定正式 `SITE_URL`，執行 `npm run build`、`npm run check`。前端只包含公開 API 網址。
6. 用專用測試 Sheet、bot／聊天室及虛構資料驗收，再決定是否開放正式收件及發布網站。正式發布仍依專案授權規則。

正式 HTTPS 前端使用 GAS Html Service 通訊頁與 `google.script.run` 傳遞 JSON，後端的 `callApi` 與原 POST 共用驗證。通訊頁只接受 `ADMIN_URL` 的來源網站及原上層視窗；僅空白通訊頁允許 iframe 嵌入，登入回程與其他頁面維持原限制。前端核對來源、iframe 關係、連線識別與請求識別，不使用萬用字元接收敏感回應。

命令列與本機 HTTP 預覽保留 `text/plain` JSON POST 相容介面；其 Content Service 重新導向仍可能受原環境問題影響。不得改用 `no-cors`：讀不到回執不代表成功。Google 帳號政策、部署權限與跨來源行為須在已部署環境驗收，離線測試不能證明這些項目。

## Telegram 權限與填寫方式

開啟既有 GAS 的「專案設定 → 指令碼屬性 → 編輯指令碼屬性 → 新增指令碼屬性」，名稱填 `TELEGRAM_BOT_TOKEN`，值貼上 BotFather 的 Bot Token，按「儲存指令碼屬性」。其他屬性用相同方式新增；Token 和 Client Secret 不貼至對話、程式碼、網站或文件。

| BotFather／Telegram 設定 | 本站需要的狀態 |
| --- | --- |
| 每位收件者與 bot 的私訊 | 每人先按 Start，保持未封鎖 bot；只知道 ID 不代表可以主動私訊。 |
| Allow Groups／`/setjoingroups` | 只供本站私訊通知時可關閉；不用把 bot 加入群組。 |
| Group Privacy／`/setprivacy` | 維持開啟；本站不讀取群組聊天。 |
| Inline Mode／`/setinline` | 本站不使用，可維持關閉。 |
| 群組管理員、刪訊息、封鎖成員等權限 | 不需要。 |
| Business／Mini App／付款／位置等功能 | 本站不需要另行啟用。 |
| Login Widget → Allowed URLs | 加入 `WEB_APP_URL` 的完整 `/exec` 網址；這是 OIDC 登入回呼，不是 Bot API webhook。 |
| Login Widget → Advanced | 維持 RS256；把此處 Client ID、Client Secret 分別填入 GAS 對應屬性。Client Secret 與 Bot Token 是不同憑證。 |
| 電話號碼、登入時請求私訊權限 | 不要求；本站只使用 `openid profile`。 |

若既有 `@KTProductionsBot` 還供其他專案使用，保留其他專案需要的能力、Allowed URLs 與 webhook；不要因本站不需要就全面關閉。委託通知使用 `sendMessage` 及圖片／動畫／文件／相簿 API，不需新增 Telegram webhook 或 bot 長輪詢；前端的登入結果輪詢與作品 Actions 排程是不同流程。

通知首次送出時會固定該單的收件名單，名單變動只影響新單。每位結果立即記在 `notificationRecipientsJson`；整筆為 `sent` 代表所有對象已送達，部分失敗或不明不會撤銷訂單。重試沿用該單名單，只重送未確認成功者；`unknown` 或中斷的 `sending` 對象仍可能收到重複通知。若要撤除舊單尚未送達的對象，先停止人工重試，再由維護者依紀錄處理，不直接改 Sheet。

## 啟用前驗收

- 登出 Google 後以虛構資料送件，確認只有一筆 Orders、取得編號，指定聊天收到通知。
- 模擬回應中斷，以原頁重試取得同一編號；不要重新整理再填一份作為重試。
- 指定管理員登入成功；其他帳號被拒絕。撤除白名單後，舊工作階段下次操作立即失效。
- 修改內容、六階段、急件／擱置及公開說明，確認 Sheet、後台及公開進度相符；兩旗標可並存，解除擱置後階段不變，工作急件標記不影響報價。兩分頁同時修改，舊版本必須顯示衝突。
- 通知失敗不丟單。確認目的地後人工重試；Telegram 通知沒有本專案可用的冪等鍵，中斷後重試可能重複通知。
- 根路徑、專案子路徑與實際自訂網域，皆測試五個頁面、收益檢視、登入回程及手機版面。

## 維護與限制

- 用後台修改訂單，避免直接改 Sheet 繞過版本與歷史。Telegram 白名單不授予直接開表的 Google 權限。
- 管理金額保存在 `detailsJson.quote`，不需升級表頭或重寫舊單。一般委託可編輯明細並加總，Trello 只記錄總額；原系統預估及來源保留。發布時先更新共用驗證的 GAS 版本，再發布前端；舊前端省略報價仍保留已存值，詳見[服務契約](../reference/order-api.md)。
- `revision` 保護編輯；舊內容留在 `historyJson`，與新內容同列一次寫入。文字欄位達 45,000 字元上限時拒絕寫入，應規劃可追溯封存，不可清空歷史。
- 通知發給指定收件者，包含完整填單內容及伺服器預估；不自動通知委託者進度，不傳送內部備註、Drive ID 或登入資料。長文、圖片與相簿的重試規則見[完整通知契約](../reference/order-api.md#完整表單通知)及[附件維護](reference-attachments.md)。
- 管理 token 自核發起固定有效 3 天（72 小時），不因讀取或重新開頁續期。後端以 Script Properties 的 `session:<token 雜湊>` 保存 ID 與到期時間；每次管理請求仍核對期限與白名單，登出或驗證失效時刪除，新登入時清理過期紀錄。GAS Cache 最長六小時且可能提早淘汰，不作為新工作階段儲存；部署前的快取工作階段仍依原一小時期限有效。
- 前端以 API 網址區隔 localStorage，只保存版本、token 及伺服器到期時間，重新開頁後由管理 API 重新驗證；不保存訂單。到期或明確拒絕清除保存，跨分頁同步結束登入；一般網路錯誤保留憑證供重試。登出先移除本機保存，若伺服器回應中斷，原頁可再次按登出。瀏覽器禁止儲存時保留本頁登入並顯示提示。
- OAuth 綁定值仍只暫放 sessionStorage，兌換成功或明確驗證失敗時刪除。交換回應遺失時，可用「重試完成登入」在原票證的兩分鐘期限內重取同一結果，不延長期限；OAuth／票證 Cache 提早失效或票證到期則須重新登入。
- 管理 API 每頁 30 筆，管理頁依序讀完全部分頁後呈現六欄看板；編號／暱稱搜尋及類型／旗標篩選涵蓋全部已取得資料，預設小動圖，沒有上方階段篩選。桌機拖曳卡片可更新階段，手機與鍵盤可點選卡片或按 Enter／空白鍵開啟編輯視窗。公開看板每次最多 200 筆，回傳各階段總數，頁面只提供類型／旗標篩選，涵蓋目前已載入範圍，只有手動補載後才包含已交稿。直接掃描 Orders 適合小型工作室，不適合大量訂單。
- 收件上限與誘捕欄位僅提供基本濫用限制，沒有驗證碼或邊緣流量防護，仍受 Apps Script、UrlFetch 與 Sheets 配額限制。
- 已有參考附件上傳、管理金額與收益紀錄；尚無線上付款、退款、委託者確認正式報價、委託者登入或刪單功能。三種類型幣別均為 TWD，預估不等於已報價或已付款。

## 管理頁目錄網址相容性

`Auth.gs` 同時接受 `admin/` 與舊 `admin.html`；GAS 固定回到設定的 ADMIN_URL，前端再依固定白名單還原作品頁或收益檢視。舊 `admin.html#ticket=…` 會由前端轉址並保留登入票證；管理頁網址或 BotFather 回呼改動仍須重新驗證。

## 官方依據

2026-09-22 核對：[Web App](https://developers.google.com/apps-script/guides/web)、[Content Service](https://developers.google.com/apps-script/guides/content)、[Script Properties](https://developers.google.com/apps-script/guides/properties)、[Lock Service](https://developers.google.com/apps-script/reference/lock/lock-service)、[Telegram Login](https://core.telegram.org/bots/telegram-login)、[sendMessage](https://core.telegram.org/bots/api#sendmessage)、[node-forge](https://github.com/digitalbazaar/forge)。
