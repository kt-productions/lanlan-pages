# 委託服務資料契約

實作為 `backend/apps-script/`、`src/features/orders/contract.js` 與 `src/features/orders/api.js`。設定見[委託服務設定](../development/order-service.md)。2026-09-23 雲端為第 13 版、32 欄 Orders；支援 Trello 歷史訂單、看板分組及 Html Service 通訊；同日依使用者要求開啟收件。

## 請求與回應

正式 HTTPS 網頁透過隱藏的 GAS Html Service 通訊頁，以 `google.script.run.callApi` 傳送 JSON 字串並接收同格式回應，避開 Content Service 一次性網址的傳遞失敗。頁面限定 `ADMIN_URL` 的 origin、隨機連線識別及上層視窗；前端也核對 Google 來源、iframe 關係及請求識別，管理操作仍共用 `requireAdmin_`。

命令列及本機 HTTP 預覽保留原 POST 相容介面，Content-Type 為 `text/plain;charset=UTF-8`，內容為 JSON：

```json
{"action":"progress.list","payload":{"offset":0},"token":""}
```

成功為 `{"ok":true,"data":…}`；失敗為 `{"ok":false,"error":{"code":"…","message":"…"}}`。Apps Script 不以 HTTP status 區分所有業務錯誤，須檢查 `ok` 與有效資料。逾時、非 JSON 或不可讀回應屬於結果不明。

| action | 權限 | 輸入／用途 |
| --- | --- | --- |
| `orders.upload` | 公開 | 與送件相同的 `requestId`、`details`、`website`、完整 `attachments` 清單，以及本檔 `index`（0–4）、`data`（base64）；回傳 `{index, uploaded:true}`。 |
| `orders.submit` | 公開 | `requestId` UUID、`details`、選填誘捕欄位 `website`、`attachments` 清單（無附件為 `[]`）；收件或取回同一回執。 |
| `progress.list` | 公開 | 非負整數 `offset`，預設 0；選填 `status`（七階段代碼）、`flag`（`rush`／`on_hold`）、`service`（`chibi`／`animation`／`stickers`），空字串表示不篩選；`limit` 為 1–200，預設 30。不需編號或登入。 |
| `auth.start` | 公開 | 64 字元 hex `browserKey`、選填 boolean `popup`；取得 Telegram 授權網址。 |
| `auth.poll` | 公開 | 原分頁 64 字元 hex `browserKey`；彈出視窗登入回傳 `{ pending: true }`、`{ ticket }` 或驗證錯誤，不回傳工作階段 token。 |
| `auth.exchange` | 公開 | `ticket` 與原分頁 `browserKey`；只建立一次工作階段，在票證原期限內可重取同一 token、Telegram ID、到期時間。 |
| `admin.list` | 管理員 | `offset`、選填 `delivery`；取得指定交稿範圍的完整訂單、通知狀態與歷史。 |
| `admin.attachment` | 管理員 | `orderId`、`index`；只從伺服器訂單取得附件 ID，回傳 `name`、`type`、`size`、`base64`。不接受任意 Drive ID。 |
| `admin.update` | 管理員 | `orderId`、`revision`、完整 `details`、`status`、boolean `isRush`、boolean `isOnHold`、選填 boolean `isArchived`（新版必傳，舊分頁省略時保留目前值）、`publicNote`、`adminNote`。歷史匯入只更新工作狀態與備註，忽略客戶端 `details` 並保留既有內容。不再接受百分比或可見性作為更新欄位。 |
| `admin.retryNotification` | 管理員 | `orderId`；重試收件通知。 |
| `auth.logout` | 管理員 | 撤銷目前 token。 |

`progress.list` 與 `admin.list` 均接受 `delivery: "active" | "delivered" | "all"`。`active` 排除已交稿，`delivered` 只回傳已交稿；省略時沿用 `all`，相容尚未重新整理的舊前端。舊 `completed` 狀態先對應為 `delivered`，交稿範圍由伺服器在分頁及計算件數前套用。

分頁回傳 `orders`、`nextOffset`、`total`（符合條件總筆數）；null 表示沒有更多。管理 API 固定每頁 30 筆，公開頁預設 30、可要求最多 200，另回傳 `stageCounts`（完整篩選結果的七階段件數）。公開清單先對完整資料篩選；歷史訂單依看板、欄位、卡片位置排序，再接新表單的收件時間及編號，最後分頁。封存委託（含來源封存）由伺服器先排除，不納入公開件數、分頁或任何篩選。公開不支援封存篩選。管理 API 保留所選交稿範圍中的封存資料，管理畫面只有 `flag=archived` 篩選顯示封存項目；管理清單維持最新加入優先。

兩個看板初次開啟或重新載入時只要求 `delivery: "active"`，完整讀完此範圍所有分頁後才更新畫面。已交稿欄標示「未載入」，欄內提供「載入已交稿」按鈕；選取已交稿篩選本身不觸發下載，仍需按該按鈕。按下後只要求 `delivery: "delivered"`，完成所有分頁才合併到現有快照，按編號去重並使用最新回應。同一頁後續搜尋、類型／階段／旗標篩選沿用已載入快照，不重抓已交稿；重新載入會恢復未交稿範圍。尚未補載時，搜尋提示明確排除已交稿，不將未載入件數顯示為零。管理員將未交稿改為已交稿時，若尚未補載，關閉編輯視窗並移出目前清單。

分頁失敗、交稿範圍錯誤、重複缺漏或讀取期間總數變動時保留先前快照，補載按鈕可重試。offset 不是伺服器固定快照，同時更新但筆數不變時仍應重新載入確認。此最佳化減少 API 回傳、前端解析與渲染量；GAS 仍讀取 Sheets 原始資料以套用篩選，沒有新增索引或快取。

管理 token 每次重新核對工作階段、到期與最新白名單，不能把前端顯示條件當成權限控制。

## 收件內容

伺服器重建白名單：`schemaVersion`、`service`、`nickname`、`contact`、`referenceUrl`、`stickerIds`、`chibiPlan`、`characterCount`、`transition`、`commercial`、`background`、`rush`、`payment`、`allowLivestream`、`allowPortfolio`、`notes`、`rulesReviewed`。

長度上限：暱稱 80、聯絡方式 300、選填 HTTPS 素材連結 2,000、特殊需求 4,000 字元。授權須明確 boolean，款式只能 01–48 且不可重複。不適用欄位重新設為 null 或空陣列。素材連結與附件至少提供一項；檔案本體不進入 Sheets，伺服器建立的附件中繼資料存於 `detailsJson.attachments`。

`attachments` 請求清單最多 5 項、合計最多 45 MiB，每項包含 `name`（最多 150 字元，不得含路徑／控制字元）、`type`、`size`（1–10 MiB）、`sha256`（64 位 hex）。上傳每次只帶一個檔案，伺服器核對 base64、實際長度、檔案標頭及 SHA-256，先驗證收件內容與配額，再寫入 Drive。貼圖只收 PNG／JPEG／GIF／WebP／AVIF；其他類型的非圖片作為文件保存。只有 `orders.upload` 可超過 40,000 字元，上限為一個 10 MiB 檔案的 base64 加 40,000 字元；其他命令維持原上限。

Script Properties 的 `REFERENCE_UPLOAD_<requestId>` 保存內容雜湊、聯絡方式雜湊、預留時間及最多五個檔案 ID／完成資料。Drive 建立前先保存 ID，回應中斷後核對原檔，不再次建立；只有全部上傳完成才寫入訂單。未完成預留與已收訂單共用 24 小時每日配額及每小時同聯絡方式三筆限制。Sheet 寫入成功後清除預留，但不刪除檔案；中途中止的私人檔案由維護者人工檢視，沒有自動刪除。儲存位置與維護見[附件維護](../development/reference-attachments.md)。

管理員讀取附件會重新驗證工作階段、資料夾、大小、類型及內容雜湊。後台按「載入預覽／下載」才讀取本體，關閉視窗、切換訂單、登出及離開頁面會撤銷 Object URL；非圖片不內嵌執行。管理更新只保留伺服器原附件，忽略客戶端偽造的附件 ID；公開進度不輸出附件或素材連結。

依部署時設定重新計算 `estimatedPrice`，保持 `confirmed: false`、`priceConfirmed: false`，忽略前端報價、狀態或管理權限。不支援的草稿版本以 `VERSION` 拒絕；第三版舊分頁仍接受原有連結收件並保留舊內容雜湊，附件上傳要求第四版。

`requestId` 對應正規化內容與附件清單的 SHA-256：同碼同內容回傳既有訂單，同碼不同內容回傳 `CONFLICT`。頁面重試保留識別碼及逐檔進度，重新整理則不保留，不能把重新填單當成冪等重試。

網路中斷、`SERVER` 與其他結果不明的錯誤都保留原快照、識別碼並鎖住編輯，因為 Sheet 可能已寫入。只有明確拒收的輸入、版本、停止收件、配額或尚未設定錯誤才恢復編輯；不能僅因收到錯誤回應就假設沒有訂單。

回執包含 `orderId`、`createdAt`、`status`、伺服器 `estimatedPrice`；客戶取得有效 `LL-` 編號才顯示成功，下載草稿仍是未送件。

## Orders 工作表

表頭順序由 `Orders.gs` 的 `ORDER_HEADERS_` 定義，每次存取均核對，不可更名或插欄。

| 分組 | 欄位 |
| --- | --- |
| 識別與時間 | `orderId`、`requestId`、`requestHash`、`createdAt`、`updatedAt`、`revision` |
| 工作進度 | `status`、`publicNote`；尾端第 28／29 欄追加 `isRush`、`isOnHold`，第 32 欄為 `isArchived` |
| 舊版相容欄 | `progress`、`publicVisible` 留在原位置，不刪除；不再以百分比或可見性篩選工作。 |
| 委託資料（暱稱供公開顯示） | `service`、`nickname`、`contactChannel`、`contactValue`、`referenceUrl`、`notes`、`adminNote` |
| 計價與內容 | `estimateMin`、`estimateMax`、`currency`、`detailsJson` |
| 匯入來源 | 第 31 欄 `sourceJson`；Trello 卡片與看板／欄位識別、順序、原名稱、標籤、封存、名稱公開選項、最後活動、匯入時間與附件連結。只在管理回應的 `source` 中完整提供。 |
| 通知 | `notificationStatus`、`notificationAttempts`、`notificationError`、`notificationAt`；同日多人通知更新另於第 30 欄加入 `notificationRecipientsJson`。 |
| 可追溯性 | `lastEditor`、`historyJson` |

新工作初始 `queued`，`isRush` 取收件需求的 `details.rush === true`，`isOnHold` 與 `isArchived` 為 false。新表單的公開回應包含 `orderId`、`service`、`status`、`isRush`、`isOnHold`、`isArchived`、`publicNote`、`updatedAt`，以及取自暱稱的 `displayTitle`；不含聯絡、素材、金額、歷史或內部備註。經使用者確認公開名稱的 Trello 匯入單另外有 `displayTitle`、`sourceArchived`、`trelloCreatedAt`、`trelloUpdatedAt`、`importedAt`；不輸出付款標籤、附件或完整來源。編號只作工作識別，不是查詢密碼；送件回執連到完整看板。

| 工作階段 | 代碼 |
| --- | --- |
| 排隊中 | `queued` |
| 草稿繪製中 | `drafting` |
| 草稿確認 | `draft_review` |
| 等待付款 | `awaiting_payment` |
| 完稿中 | `finalizing` |
| 待付尾款 | `awaiting_balance` |
| 已交稿 | `delivered` |

管理員可前進、退回或跳至適用階段；狀態只是工作紀錄，不代表已串接付款。`isRush`（急件）、`isOnHold`（擱置）可各自開關及並存，擱置不取代階段，解除後保持原階段。兩個旗標適用所有工作，與收件的 `details.rush` 分開；後台的「急件需求（影響報價）」才參與原本計價。表單第 4 版另支援多檔附件，工作階段與計價規則保持相同。

### 2026-09-23 舊資料相容方式

- `setupOrders()` 核對已知的 27／29／30／31 欄舊版表頭，只在待追加欄位的表頭與整欄均空白、無公式時才追加；欄數不足時擴充。第 28／29 欄為工作旗標，同日多人通知更新另加入第 30 欄，Trello 匯入再追加第 31 欄，封存功能追加第 32 欄。任何未知表頭或占用欄位均停止，不自動覆蓋。既有資料列、revision、歷史均保留，再次執行不重複寫入。一般 API 要求與 `ORDER_HEADERS_` 完整一致，未升級時拒絕操作。
- 舊狀態僅在讀取時對應：`received`／`discussing`／舊 `queued` → `queued`，`working` → `finalizing`，`reviewing` → `draft_review`，`completed` → `delivered`。`cancelled` → `queued` 並預設擱置；不因此清除取消歷史或認定重新承接。這是舊概略狀態的相容對應，管理員應依實際工作調整，未知代碼回傳 `CONFIG`。
- 舊列旗標空白時，急件沿用 `detailsJson.rush`，擱置依上述取消對應；讀取不回寫。第一次管理儲存才寫入明確 boolean，之後不再隨報價需求變動。`historyJson.before` 保存舊狀態、百分比、可見性及修改前旗標。
- 舊 `publicVisible: false` 的工作未封存時會顯示暱稱、階段與旗標，但其 `publicNote` 輸出空字串。後台仍可讀取原說明；管理員依「儲存後會公開」提示儲存後，`publicVisible` 設 true 並公開確認後的文字。新工作預設未封存；封存後由公開 API 排除。
- `progress` 原值保留不再更新，新列填 0 僅供舊欄相容；前台與後台皆移除百分比。前後端須一起更新，舊版管理介面缺少旗標會被拒絕，不能混用部署。

管理修改在 ScriptLock 內核對 `revision`，保存舊內容及操作者 Telegram ID，再一次寫入新內容、版本與歷史；不提供刪單 API。字串寫入 Sheet 前做公式跳脫，畫面以 `textContent` 呈現。

通知狀態為 `pending`、`sending`、`sent`、`failed`、`unknown`；歷史匯入為 `not_required`，前後端均禁止發送收件通知。先存訂單再傳送，失敗不回滾。傳送中兩分鐘內不允許重試，逾時可人工重試；已通知不重傳。通知不更改業務版本，完成時重新讀取再寫狀態，避免覆蓋同期的管理修改。

`TELEGRAM_NOTIFY_USER_IDS` 支援 1–20 位正整數使用者 ID，去重後逐位傳送；未設定時相容舊 `TELEGRAM_CHAT_ID`。第 30 欄 `notificationRecipientsJson` 保存第一次通知的固定名單，每位含 `id`、`status`、`attempts`、`at`、`error`。逐位保存成功結果，重試不再傳給已送達者；後續名單設定只影響新單。舊版已標記 `sent` 的單不補發。每輪仍更新 `notificationAttempts`，以該輪識別防止過期回應覆寫較新的重試；每位開始與完成時更新 `notificationAt`。

整筆 `sent` 代表所有對象的文字與附件都成功；執行期間保留 `sending` 租約。整輪結束後，優先標示不明結果 `unknown`，其次失敗 `failed`；只有尚未嘗試的部分才留為 `pending`，不能因後續段落未送而自動重試不明結果。部分已送達時 `notificationError` 為 `PARTIAL_DELIVERY`，實際逐位代碼留在紀錄中，不保存 Telegram 原始回應或例外。無管理網址時省略通知中的後台連結。通知名單、結果 JSON 均不進入公開進度回應。

兩至五張 PNG／JPEG／WebP 透過 Telegram `sendMediaGroup` 合併成相簿，只有首張附委託編號、類型、數量與後台入口。單張使用 `sendPhoto`，單檔 GIF 使用 `sendAnimation`，其他檔案使用 `sendDocument`；多個其他格式合併為文件群組，與圖片分組。圖片受到 Telegram 限制而明確回覆 400 才整組改送文件；網路結果不明不自動改送。每位收件人的 `parts` 逐檔保存狀態、嘗試次數、成功的 Telegram `file_id` 及相簿 `groupId`，供同 bot 重用傳送，重試只補未成功部分或收件人；不明結果仍可能重複。相簿成功回應必須包含完整訊息陣列，缺項視為不明。每輪約 80 秒後停止開始新文字或群組，剩餘標示 `pending`，由後台重試接續。舊版已成功的通知不自動補寄圖片。

### 完整表單通知

不論是否附檔，先傳送完整文字內容，再傳圖片相簿／檔案。文字包含委託編號、類型、暱稱、聯絡平台與方式、參考連結及檔名、適用的款式／方案／人數／轉場／背景／急件、商用、付款、直播與範例授權、閱讀確認、特殊需求、伺服器預估範圍與計價明細、報價說明及後台入口。未詢問的選項標示「此表單未詢問」，不當作否；不傳內部備註、私人 Drive 識別碼或登入資料。

`NotificationText.gs` 使用純文字，不解析使用者 HTML／Markdown，停用連結預覽。單則最多 4096 字元；超過時以保留完整內容的段落拆分，每段附編號與段次，避免切斷表情符號。圖片首張仍只附簡短說明，維持一組相簿。限制來源為 [Telegram sendMessage](https://core.telegram.org/bots/api#sendmessage) 及 [InputMediaPhoto](https://core.telegram.org/bots/api#inputmediaphoto)。

第一次通知把文字快照保存一次於名單首項的 `messageTexts`，每位的 `textParts` 逐段保存狀態、次數、時間及錯誤代碼，與附件 `parts` 分開。後台重試沿用文字快照，已送達段落或相簿不重傳；未知結果人工重試仍可能重複。舊版已完成的訂單及收件人不補寄；舊未完成通知重試時才建立完整文字快照。此更新沿用第 30 欄 JSON，不新增欄位、權限或收件對象。

### 封存與解除

`isArchived` 是獨立附加狀態，第 32 欄保存 boolean；空白舊列讀取時沿用 `source.archived`，沒有來源則為 false，不批次改寫歷史。明確 false 可解除原 Trello 封存；來源紀錄保持原樣。封存不改工作階段、急件、擱置、報價、附件或收件通知，更新仍核對 revision 並將舊封存值保存於歷史。管理清單的「所有工作」、急件、擱置排除封存；「封存」只顯示封存，可搭配類型、階段、搜尋。

## 登入與錯誤

Authorization Code + PKCE S256、單次 state 及 nonce；後端向固定 Telegram token 端點換碼，從固定 JWKS 端點取公鑰，只接受 RS256 並驗證簽章、issuer、audience、nonce、時間及 `profile.id` 白名單。未知金鑰重新取得一次；不使用 JWT 自帶金鑰網址。

回程只能到設定的 `ADMIN_URL`。fragment 僅攜帶兩分鐘有效且綁定原分頁的票證，真正 token 由 API 回應交給前端；前端以 API 網址區隔 localStorage，僅保存 token、版本與 `expiresAt`。新工作階段從核發起固定 72 小時，後端將 token 雜湊對應的 ID、到期時間持久保存於 Script Properties，每次管理請求驗證期限與白名單。重新開頁、讀取或重試皆不續期；登出、到期或確認白名單已撤除即撤銷，原 token 不再恢復。舊版快取工作階段沿用原期限，不自動延長。

票證僅建立一次工作階段；原分頁重試可在原期限內重取同一結果，不刷新票證或工作階段的到期時間，已登出或撤除權限時也不能恢復。前端保留未完成的票證於記憶體並提供「重試完成登入」，成功或明確驗證失敗後清除 sessionStorage 暫存綁定。瀏覽器儲存被阻擋時提示登入只在本頁有效；一般網路錯誤不刪除已保存的登入。白名單不使用 username 或 OIDC `sub`。

管理頁在使用者按登入時同步開啟 Telegram 視窗，指定 `popup: true`，原頁以 `auth.poll` 取得綁定結果後沿用 `auth.exchange`。等待期限十分鐘，成功／失敗結果快取兩分鐘；結果以 browserKey 雜湊保存並核對對應 state，另一把 browserKey 不能取得結果。取消或離開原頁停止輪詢，網路錯誤最多連續嘗試三次，逾時及拒絕可重新登入。GAS 成功頁及原頁均嘗試關閉驗證視窗，關閉受阻不影響登入。彈出視窗被阻擋時退回原分頁驗證及手動回程，不要求新增 Telegram 權限。

錯誤代碼：`VALIDATION` 輸入、`VERSION` 表單過期、`AUTH` 登入失效、`FORBIDDEN` 沒有管理權限、`CONFLICT` 版本或冪等衝突、`CLOSED` 停止收件、`RATE_LIMIT` 收件上限、`BUSY` 處理中、`CAPACITY` 欄位容量、`CONFIG` 設定不足、`SERVER` 未預期錯誤。平台原始例外與憑證不回傳給瀏覽器。
