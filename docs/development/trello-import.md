# Trello 歷史訂單匯入

2026-09-23 使用者指定三個公開看板，並確認匯入全部卡片（包含封存）及沿用原公開名稱。依同日後續需求，新表單改為公開暱稱，來源封存卡片預設排除於公開進度及一般管理看板。這是一次性移轉，不會持續與 Trello 同步。

## 來源與資料界線

維護者將看板 JSON 匯出保存在專案外，交由 `scripts/lib/trello-import.mjs` 的 `prepareTrelloImport(boards, options)` 轉換。每個輸入包含完整 `board`、本站 `service` 與明確的 `stages`（Trello list ID 對應本站階段）；`includeArchived`、`publishTitle` 必須明確指定。未對應的欄位會停止，不能猜測階段或按人名合併卡片。

本次來源的排隊、草稿製作、完稿、待付尾款、已完成，分別對應 `queued`、`drafting`、`finalizing`、`awaiting_balance`、`delivered`。來源「草稿確認／等待付款」合併欄對應 `draft_review`，本次三板此欄均無卡片；未來有資料時，須先確認是否仍適用。

- 卡片 ID 用於去重；同名卡片仍是不同訂單。看板、欄位、卡片順序與名稱保留於來源快照。
- 來源封存卡片預設視為本站封存，只在管理「附加狀態 → 封存」列出，保留原工作階段。可於編輯視窗解除封存；明確的本站旗標優先於來源值，來源原值仍保留，不推定成取消或擱置。
- 「加急／急單／急件」映射急件，「擱置」映射擱置。其他原標籤只放後台來源紀錄；收款標籤不推定金額、付款方式或本站已確認付款。
- PNG 附件只保存原 Trello 連結於後台，沒有複製檔案或公開展示授權；原附件的存取仍取決於 Trello。
- `details.recordType: "trello-import"` 表示歷史資料，與表單草稿分開。只保留類型、原名稱及未知的 `contact`／`referenceUrl`／`notes`／`estimatedPrice`（null）；不套用現行價格，不補造方案、授權或原始收件日期。
- 2026-09-24 新增管理員手動金額，另存 `details.quote`，只提供新台幣總額、`items: null`；不從來源標籤推定金額，也不補造計價明細。原 `estimatedPrice` 仍為 null，編輯及清除均保留修改歷史。
- `createdAt`、`updatedAt` 初值是匯入時間，來源最後活動另存 `source.lastActivity`，建立時間由 Card ID 換算為 `source.createdAt`；不把 Trello 活動時間冒充收件日期。
- 已交稿排序不把匯入及純帳務補齊視為委託更新：讀取歷史往前略過只改金額／收益日期的已交稿編輯，保留真正的進度、旗標、說明及內容更新；回到匯入時間且來源活動有效時，`sortUpdatedAt = source.lastActivity`。歷史不完整時不猜測，詳見[排序契約](../reference/order-api.md)。不改寫 Sheets、原始時間或歷史，不持續同步 Trello。公開／管理回應都提供排序時間，未核可公開名稱者也不需輸出完整來源才能維持順序。

## 執行與核對

1. 備份既有 Sheets 全表、GAS 原始碼與部署版本，確認目標資源及收件狀態。完整來源、批次、備份與真實姓名不得進入公開倉庫、測試或網站產物。
2. 執行 `npm test`、`npm run build:backend`。上傳最新來源並由專案編輯者執行 `setupOrders()`；現有 27／29／30／31 欄僅追加至 32 欄，資料或公式占用新增欄時停止。
3. 用私人暫存入口呼叫 `importTrelloOrders_(payload)`。它核對執行身分、驗證整批白名單欄位，再於 ScriptLock 內單次追加；每批最多 500 張，已有來源卡片只跳過。HTTP API 沒有匯入 action。
4. 比對各類型、工作階段、封存、附件、唯一來源件數及原訂單與歷史；再跑相同批次，應新增 0 筆。來源相同但之後已編輯的訂單也不覆蓋。
5. 移除雲端暫存入口與真實批次，再建立正式版本並更新既有 Web App 部署。一般部署只含通用匯入程式，不含實際訂單。
6. 驗證公開看板與後台。匯入單為 `not_required`，通知嘗試 0；後台及伺服器均不允許補送歷史收件通知。匯入單不占用今日新單配額。

後台可調整階段、急件／擱置、公開說明及內部備註，仍保存版本與修改前快照。歷史資料內容及來源唯讀，伺服器忽略客戶端對 `details` 的改寫。要補完整需求或處理來源修正，應另規劃可追溯的維護，不直接改表或重跑覆蓋。

回復時先停止後續維護並保存目前資料；可回復前一部署，但不得刪除第 31 欄或已匯入的訂單／歷史。舊版管理介面不適用歷史訂單，應優先修正新版，避免用舊版編輯缺少完整表單資料的列。

## Trello 來源時間

依 [Trello 官方 API 文件](https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/)，Card ID 採 Mongo ID，前 8 個十六進位字元可換算為 Unix 秒級建立時間。讀取時由已保存的 Card ID 取得，不需改寫 174 筆訂單或歷史。這是卡片建立時間，不能當成委託正式收件時間。

[`dateLastActivity`](https://developer.atlassian.com/cloud/trello/guides/rest-api/object-definitions/) 是最後活動時間；移動、內容、標籤等異動可能更新它，不限製作進度。本站保留匯入當時的值，沒有持續同步。後台來源區顯示 Trello 建立、Trello 最後活動及匯入本站時間；公開卡片已移除「訂單資訊」展開區，雖保留核可的 API 時間欄位，畫面不再列出這些時間。UTC 原值保留於資料，介面以台灣時間呈現。
