# LanLan Pages — 爛爛 LANLAN 個人作品集

爛爛的角色動畫、貼圖與小動圖作品集，提供委託表單、公開進度、作品管理及收益報表。網站採原生 HTML、CSS、JavaScript（ES Modules）與 Node.js 靜態建置；Google Apps Script 負責 Telegram 管理登入、Sheets 訂單、私人 Drive 附件及通知。

[正式網站](https://kt-productions.github.io/lanlan-pages/) · [GitHub 倉庫](https://github.com/kt-productions/lanlan-pages) · [文件導覽](docs/README.md)

## 功能與入口

下列為目前工作樹的功能。程式已實作與正式環境已部署是不同狀態；最近驗收依據及待發布項目見[現況與決策對照](docs/development/current-state.md)。

| 入口 | 功能 |
| --- | --- |
| 首頁 `/` | 作品分類、分批載入、影片播放與放大檢視、價目及聯絡資訊。 |
| 委託表單 `commission/` | 三種類型、三步驟、即時預估、JSON 草稿及正式送件；最多五檔私人附件。 |
| 委託進度 `progress/` | 公開六階段看板，顯示暱稱及急件／擱置標記；排除封存委託。 |
| 委託管理 `admin/` | 編輯需求、階段、封存、金額與收款日期，重試未完成通知。 |
| 作品管理 `artworks/` | 新增、編輯、草稿、發布及下架；按「儲存並發布」直接送出，沒有發布確認勾選。 |
| 收益報表 `admin/?view=revenue` | 每月／全年收益、待補資料與訂單編輯；共用管理頁的登入及編輯器。 |

主導覽的三個管理入口共用 Telegram 身分驗證。已保存且未到期的登入會立即顯示入口，再由後端確認權限；登出、到期或確認權限失效時隱藏。每次管理 API 都重新驗證，導覽是否顯示不代表取得資料權限。登入自核發起固定 72 小時，瀏覽器只保存 token、版本及到期時間。

委託看板預設只讀未交稿，已交稿按需補載。公開與管理看板的已交稿依最後更新時間由新到舊排列；Trello 舊單單純補金額／收益日期不移動卡片，沒有其他本站更新時採來源最後活動時間，避免匯入及補資料打亂歷史順序。未交稿維持原始建立時間由舊到新。收益報表讀取完整訂單快照，不受看板篩選影響；真實收益、暫收訂金與未完成餘額的定義見[收益規格](docs/reference/revenue-report.md)。網站沒有付款、退款或委託者帳號功能。

已交稿且已設定金額的委託，即使未填交稿日也會計入累計真實收益；日期只用於年度與月份分類，未填日期者另列已認列的未分月份明細。
拖曳卡片或在編輯視窗切換為已交稿時，自動填入台灣當天的實際交稿日；仍可手動修正歷史日期。
排隊中開始繪製草稿時，依委託類型與貼圖張數預填工作天交期；草稿階段轉入完稿中時記錄訂金收款日。工期從隔天起算、只跳過週六日，詳細規則見[收益與日期規格](docs/reference/revenue-report.md#日期與待補資料)。

## 開發與驗證

需要 Node.js 22 以上；CI 使用 Node.js 24。前端沒有第三方執行期套件，鎖定的 node-forge 僅用於 Apps Script 登入簽章驗證。

```sh
npm ci
npm test
npm run build
npm run check
```

本機預覽使用 `npm run dev`，只監聽 <http://127.0.0.1:4173/lanlan-pages/>；修改後須重新建置及整理頁面，沒有熱更新。代理啟動預覽前依 [AGENTS.md](AGENTS.md) 確認授權。環境變數、後端打包及媒體工具見[開發指南](docs/development/setup.md)，檢查範圍見[驗證指南](docs/development/validation.md)。

## 維護與發布

- 頁面及模組位置見[程式碼架構](docs/development/architecture.md)；介面以[文字規格](docs/design/interface.md)維護。
- 費率與草稿以[委託規格](docs/reference/commission.md)、[草稿契約](docs/reference/draft-schema.md)及內容 JSON 為準；原始來源與現行規則分開保存。
- 後端設定見[委託服務](docs/development/order-service.md)、[參考附件](docs/development/reference-attachments.md)及[作品服務](docs/development/artwork-service.md)。
- `main` 執行驗證，`production` 觸發 GitHub Pages 發布。更新後端契約時先部署 GAS，再將已驗證的版本快轉至 production；只推 main 不代表網站已更新。
- 作品原檔與衍生檔保留來源及雜湊；訂單、憑證、私人維運清單與驗收暫存放在公開專案外，規則見[資料保存界線](docs/development/publication.md)。

歷史部署版本、個別修正與驗收結果集中於[歷史紀錄](docs/records/README.md)，不作為即時服務狀態。協作、資料保留與外部操作授權均以 [AGENTS.md](AGENTS.md) 及使用者後續明確決策為準。

## 權利

網站程式碼與作品未授予開源或再利用授權。作品著作權屬繪師及各角色權利人所有。頁尾保留作品權利標示與乾太的開發維運署名，年份自動更新；維運署名不另行宣告網站程式的權利歸屬。
