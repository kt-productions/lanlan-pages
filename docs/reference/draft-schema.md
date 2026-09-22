# JSON 草稿契約

規格核對日期：2026-09-22。依 `src/features/commission/draft.js` 的 `createDraft()` 與 `content/commission.json` 整理。此文件只記錄已實作的本機草稿；正式送件另見[服務契約](order-api.md)。

## 目前流程

首頁連至獨立 `commission/`。表單支援三種類型與三步驟：委託內容 → 聯絡與設定 → 確認內容。下載 `lanlan-commission-preview.json` 本身不會送出訂單、上傳參考檔、加入排單或處理付款。

`src/pages/commission/index.js` 呼叫 `src/features/commission/draft.js` 的 `createDraft()` 建立確認快照；返回修改後再次進入確認頁時重新產生。切換類型會清除快照、閱讀確認及下載狀態，回到第一步；其他已填欄位可能保留，但不適用的控制會停用，草稿依所選類型輸出。

送出前的表單只保存在目前頁面記憶體，重新整理即清除，沒有 localStorage、自動儲存、草稿匯入或跨裝置同步。下載檔只含文字及檔案中繼資料，無圖片或其他檔案本體。

## 第 3 版草稿契約

`schemaVersion` 取自 `content/commission.json` 的 `version`，目前為 3。下表列出確認快照的完整頂層欄位；只描述有效填答後的正常輸出，不是後端驗證器。

| 欄位 | 型別與目前輸出規則 |
| --- | --- |
| `schemaVersion` | number，目前為 `3`。 |
| `mode` | string，固定 `"local-preview"`。 |
| `submitted` | boolean，固定 `false`。 |
| `service` | string：`stickers`、`animation`、`chibi`。 |
| `sourceForm` | string：目前類型在設定中的原始 Google 表單 URL，供來源追溯，不會向該 URL 送件。 |
| `nickname` | string：去除首尾空白的暱稱。 |
| `contact` | object：`channel` 為 `telegram`、`facebook`、`discord`；`value` 為去除首尾空白的聯絡文字。 |
| `referenceUrl` | string：去除首尾空白的 HTTPS 素材連結；正式送件必填，本機草稿可為空。 |
| `reference` | object 或 null：未選本機檔案為 null；有檔案時 `name` 為檔名、`size` 為 bytes、`type` 為 MIME（未知時使用 `application/octet-stream`）、`uploaded` 固定 `false`。 |
| `stickerIds` | number 陣列：貼圖為所選編號，其他類型為 `[]`；有效填答至少一款。 |
| `chibiPlan` | 小動圖為 `"illustration"` 或 `"animated"`，其他類型為 `null`。 |
| `characterCount` | 角色動畫及小動圖為數字 `1` 或 `2`，貼圖為 `null`。 |
| `transition` | 角色動畫為 boolean，表示是否加購轉場；其他類型為 `null`。 |
| `commercial` | 貼圖及角色動畫為 boolean；小動圖為 `null`。 |
| `background` | 角色動畫為 boolean：`true` 代表需要背景與特效，`false` 代表單色／無背景；其他類型為 `null`。 |
| `rush` | 角色動畫及小動圖為 boolean；貼圖為 `null`。 |
| `payment` | string：`"bank"` 或 `"paypal"`，只記錄選擇，不代表已付款。 |
| `allowLivestream` | 貼圖及角色動畫為 boolean；小動圖為 `null`。 |
| `allowPortfolio` | 三種類型皆為 boolean，不是可為 `null` 的欄位；必須由填單者選擇。 |
| `notes` | 貼圖及角色動畫為去除首尾空白的 string，未填時為 `""`；小動圖為 `null`。 |
| `rulesReviewed` | boolean，有效填答後為 `true`；切換類型會要求重新確認。 |
| `priceConfirmed` | boolean，固定 `false`。 |
| `estimatedPrice` | object，結構如下表。 |

| `estimatedPrice` 子欄位 | 型別與用途 |
| --- | --- |
| `min`、`max` | number：以元為單位的預估上下限，可有小數；不是以分為單位的輸出。 |
| `currency` | 貼圖及小動圖為 `"TWD"`；角色動畫為 `null`。 |
| `items` | object 陣列，每筆含文字 `label`、數值 `min` 與 `max`；折扣為負值，依項目加總得到預估上下限。 |
| `notes` | string 陣列：未選選項、範圍費用及報價限制等說明。 |
| `empty` | boolean：貼圖未選款式時為 `true`，此時介面不允許進入確認頁；其他正常估算為 `false`。 |
| `confirmed` | boolean，固定 `false`。 |

草稿沒有訂單編號、送件時間或通知狀態；正式收件回執使用獨立[服務契約](order-api.md)。下載草稿即使在送件後仍保留未送件旗標，不可當作回執。

第 3 版新增 referenceUrl，reference 可為 null；第 2 版檔案中繼資料格式保留於歷史紀錄，不自動匯入或送出舊草稿。

## 計價來源與契約變更

`estimatedPrice` 由 `src/features/commission/pricing.js` 的 `estimateCommission()` 產生，與預估欄、手機金額列及確認頁共用結果。完整費率、欄位適用條件與前端驗證限制以[表單與計價規格](commission.md)為準。

不適用欄位不參與當次計價，草稿依上表輸出 `null` 或空陣列。修改名稱、型別或空值語意時，須同步檢視 `version`、`schemaVersion`、確認頁、下載內容與本文件；後端仍須依[服務契約](order-api.md)重新驗證。
