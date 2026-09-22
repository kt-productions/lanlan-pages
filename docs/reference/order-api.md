# 委託服務資料契約

實作為 `backend/apps-script/`、`src/features/orders/contract.js` 與 `src/features/orders/api.js`。設定見[委託服務設定](../development/order-service.md)。2026-09-23 已更新所有工作的公開看板及多人通知，雲端部署第 1 版、表頭升級為 30 欄；維持暫停收件，Telegram 真實通知與登入待設定及驗收。

## 請求與回應

資料操作使用 POST，Content-Type 為 `text/plain;charset=UTF-8`，內容為 JSON：

```json
{"action":"progress.list","payload":{"offset":0},"token":""}
```

成功為 `{"ok":true,"data":…}`；失敗為 `{"ok":false,"error":{"code":"…","message":"…"}}`。Apps Script 不以 HTTP status 區分所有業務錯誤，須檢查 `ok` 與有效資料。逾時、非 JSON 或不可讀回應屬於結果不明。

| action | 權限 | 輸入／用途 |
| --- | --- | --- |
| `orders.submit` | 公開 | `requestId` UUID、`details`、選填誘捕欄位 `website`；收件或取回同一回執。 |
| `progress.list` | 公開 | 非負整數 `offset`，預設 0；選填 `status`（七階段代碼）、`flag`（`rush`／`on_hold`），空字串表示不篩選。列出所有工作的匿名進度，不需編號或登入。 |
| `auth.start` | 公開 | 64 字元 hex `browserKey`；取得 Telegram 授權網址。 |
| `auth.exchange` | 公開 | 單次 `ticket` 與原分頁 `browserKey`；回傳管理 token、Telegram ID、到期時間。 |
| `admin.list` | 管理員 | `offset`；取得完整訂單、通知狀態與歷史。 |
| `admin.update` | 管理員 | `orderId`、`revision`、完整 `details`、`status`、boolean `isRush`、boolean `isOnHold`、`publicNote`、`adminNote`。不再接受百分比或可見性作為更新欄位。 |
| `admin.retryNotification` | 管理員 | `orderId`；重試收件通知。 |
| `auth.logout` | 管理員 | 撤銷目前 token。 |

分頁回傳 `orders`、`nextOffset`、`total`（符合條件總筆數）；null 表示沒有更多，每頁 30 筆。公開清單先對完整資料篩選，再依收件時間由早到晚、同時以編號排序，最後分頁；已交稿及擱置的工作仍在清單中。管理清單維持新收件優先，搜尋只涵蓋已載入項目。offset 分頁不是固定快照，同時新增或更新時可重新整理取得目前結果；前端以編號去重。

管理 token 每次重新核對工作階段、到期與最新白名單，不能把前端顯示條件當成權限控制。

## 收件內容

伺服器重建白名單：`schemaVersion`、`service`、`nickname`、`contact`、`referenceUrl`、`stickerIds`、`chibiPlan`、`characterCount`、`transition`、`commercial`、`background`、`rush`、`payment`、`allowLivestream`、`allowPortfolio`、`notes`、`rulesReviewed`。

長度上限：暱稱 80、聯絡方式 300、HTTPS 素材連結 2,000、特殊需求 4,000 字元。授權須明確 boolean，款式只能 01–48 且不可重複。不適用欄位重新設為 null 或空陣列，檔案本體與中繼資料不進入訂單。

依部署時設定重新計算 `estimatedPrice`，保持 `confirmed: false`、`priceConfirmed: false`，忽略前端報價、狀態或管理權限。草稿版本不符以 `VERSION` 拒絕。

`requestId` 對應正規化內容 SHA-256：同碼同內容回傳既有訂單，同碼不同內容回傳 `CONFLICT`。頁面重試保留識別碼，重新整理則不保留，不能把重新填單當成冪等重試。

網路中斷、`SERVER` 與其他結果不明的錯誤都保留原快照、識別碼並鎖住編輯，因為 Sheet 可能已寫入。只有明確拒收的輸入、版本、停止收件、配額或尚未設定錯誤才恢復編輯；不能僅因收到錯誤回應就假設沒有訂單。

回執包含 `orderId`、`createdAt`、`status`、伺服器 `estimatedPrice`；客戶取得有效 `LL-` 編號才顯示成功，下載草稿仍是未送件。

## Orders 工作表

表頭順序由 `Orders.gs` 的 `ORDER_HEADERS_` 定義，每次存取均核對，不可更名或插欄。

| 分組 | 欄位 |
| --- | --- |
| 識別與時間 | `orderId`、`requestId`、`requestHash`、`createdAt`、`updatedAt`、`revision` |
| 工作進度 | `status`、`publicNote`；尾端第 28／29 欄追加 `isRush`、`isOnHold` |
| 舊版相容欄 | `progress`、`publicVisible` 留在原位置，不刪除；不再以百分比或可見性篩選工作。 |
| 私人委託資料 | `service`、`nickname`、`contactChannel`、`contactValue`、`referenceUrl`、`notes`、`adminNote` |
| 計價與內容 | `estimateMin`、`estimateMax`、`currency`、`detailsJson` |
| 通知 | `notificationStatus`、`notificationAttempts`、`notificationError`、`notificationAt`；同日多人通知更新另於第 30 欄加入 `notificationRecipientsJson`。 |
| 可追溯性 | `lastEditor`、`historyJson` |

新工作初始 `queued`，`isRush` 取收件需求的 `details.rush === true`，`isOnHold` 為 false。公開回應固定只有 `orderId`、`service`、`status`、`isRush`、`isOnHold`、`publicNote`、`updatedAt`，不含暱稱、聯絡、素材、金額、歷史或內部備註。編號只作工作識別，不是查詢密碼；送件回執連到完整看板。

| 工作階段 | 代碼 |
| --- | --- |
| 排隊中 | `queued` |
| 草稿繪製中 | `drafting` |
| 草稿確認 | `draft_review` |
| 等待付款 | `awaiting_payment` |
| 完稿中 | `finalizing` |
| 待付尾款 | `awaiting_balance` |
| 已交稿 | `delivered` |

管理員可前進、退回或跳至適用階段；狀態只是工作紀錄，不代表已串接付款。`isRush`（急件）、`isOnHold`（擱置）可各自開關及並存，擱置不取代階段，解除後保持原階段。兩個旗標適用所有工作，與收件的 `details.rush` 分開；後台的「急件需求（影響報價）」才參與原本計價。表單仍維持第 3 版，草稿／收件內容未改。

### 2026-09-23 舊資料相容方式

- `setupOrders()` 核對已知的 27／29 欄舊版表頭，只在待追加欄位的表頭與整欄均空白、無公式時才追加；欄數不足時擴充。第 28／29 欄為工作旗標，同日多人通知更新另加入第 30 欄。任何未知表頭或占用欄位均停止，不自動覆蓋。既有資料列、revision、歷史均保留，再次執行不重複寫入。一般 API 要求與 `ORDER_HEADERS_` 完整一致，未升級時拒絕操作。
- 舊狀態僅在讀取時對應：`received`／`discussing`／舊 `queued` → `queued`，`working` → `finalizing`，`reviewing` → `draft_review`，`completed` → `delivered`。`cancelled` → `queued` 並預設擱置；不因此清除取消歷史或認定重新承接。這是舊概略狀態的相容對應，管理員應依實際工作調整，未知代碼回傳 `CONFIG`。
- 舊列旗標空白時，急件沿用 `detailsJson.rush`，擱置依上述取消對應；讀取不回寫。第一次管理儲存才寫入明確 boolean，之後不再隨報價需求變動。`historyJson.before` 保存舊狀態、百分比、可見性及修改前旗標。
- 舊 `publicVisible: false` 的工作會顯示匿名階段與旗標，但其 `publicNote` 輸出空字串。後台仍可讀取原說明；管理員依「儲存後會公開」提示儲存後，`publicVisible` 設 true 並公開確認後的文字。新工作一律出現在看板。
- `progress` 原值保留不再更新，新列填 0 僅供舊欄相容；前台與後台皆移除百分比。前後端須一起更新，舊版管理介面缺少旗標會被拒絕，不能混用部署。

管理修改在 ScriptLock 內核對 `revision`，保存舊內容及操作者 Telegram ID，再一次寫入新內容、版本與歷史；不提供刪單 API。字串寫入 Sheet 前做公式跳脫，畫面以 `textContent` 呈現。

通知狀態為 `pending`、`sending`、`sent`、`failed`、`unknown`。先存訂單再傳送，失敗不回滾。傳送中兩分鐘內不允許重試，逾時可人工重試；已通知不重傳。通知不更改業務版本，完成時重新讀取再寫狀態，避免覆蓋同期的管理修改。

`TELEGRAM_NOTIFY_USER_IDS` 支援 1–20 位正整數使用者 ID，去重後逐位傳送；未設定時相容舊 `TELEGRAM_CHAT_ID`。第 30 欄 `notificationRecipientsJson` 保存第一次通知的固定名單，每位含 `id`、`status`、`attempts`、`at`、`error`。逐位保存成功結果，重試不再傳給已送達者；後續名單設定只影響新單。舊版已標記 `sent` 的單不補發。每輪仍更新 `notificationAttempts`，以該輪識別防止過期回應覆寫較新的重試；每位開始與完成時更新 `notificationAt`。

整筆 `sent` 代表所有對象成功；尚有傳送中者為 `sending`，全部嘗試結束後只要有不明結果即為 `unknown`，其他失敗為 `failed`。部分已送達時 `notificationError` 為 `PARTIAL_DELIVERY`，實際逐位代碼留在紀錄中，不保存 Telegram 原始回應或例外。無管理網址時省略通知中的後台連結。通知名單、結果 JSON 均不進入公開進度回應。

## 登入與錯誤

Authorization Code + PKCE S256、單次 state 及 nonce；後端向固定 Telegram token 端點換碼，從固定 JWKS 端點取公鑰，只接受 RS256 並驗證簽章、issuer、audience、nonce、時間及 `profile.id` 白名單。未知金鑰重新取得一次；不使用 JWT 自帶金鑰網址。

回程只能到設定的 `ADMIN_URL`。fragment 僅攜帶兩分鐘有效、單次且綁定原分頁的票證，真正 token 由 POST 回應交給記憶體。白名單不使用 username 或 OIDC `sub`。

錯誤代碼：`VALIDATION` 輸入、`VERSION` 表單過期、`AUTH` 登入失效、`FORBIDDEN` 沒有管理權限、`CONFLICT` 版本或冪等衝突、`CLOSED` 停止收件、`RATE_LIMIT` 收件上限、`BUSY` 處理中、`CAPACITY` 欄位容量、`CONFIG` 設定不足、`SERVER` 未預期錯誤。平台原始例外與憑證不回傳給瀏覽器。
