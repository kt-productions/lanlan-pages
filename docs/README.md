# 文件導覽

先讀[專案 README](../README.md)與[現況與決策對照](development/current-state.md)，協作及授權界線見 [AGENTS.md](../AGENTS.md)。現行操作、資料規格與歷史驗收分開維護，避免把舊版本結果當成目前功能。

## 依工作選擇文件

| 工作 | 先讀 |
| --- | --- |
| 新環境、建置、本機預覽或發布 | [開發指南](development/setup.md)、[驗證指南](development/validation.md) |
| 找程式位置、修改頁面或導覽 | [程式碼架構](development/architecture.md)、[介面規格](design/interface.md) |
| 調整委託欄位、費率或草稿 | [委託規格](reference/commission.md)、[草稿契約](reference/draft-schema.md) |
| 維護登入、訂單、通知或附件 | [委託服務](development/order-service.md)、[API 契約](reference/order-api.md)、[附件維護](development/reference-attachments.md) |
| 新增作品、換檔或發布失敗 | [作品服務](development/artwork-service.md)、[素材盤點](reference/assets.md) |
| 核對收益與缺少日期 | [收益報表](reference/revenue-report.md) |
| 查部署背景、修正原因或過去測試 | [歷史紀錄索引](records/README.md) |

## 現行設計與開發

| 文件 | 維護範圍 |
| --- | --- |
| [現況與決策對照](development/current-state.md) | 工作樹功能、最後記錄的正式驗收、待發布項目與 AGENTS 後續決策。 |
| [介面規格](design/interface.md) | 色彩、版面、斷點、導覽、媒體與管理操作；設計概念只保留文字。 |
| [開發指南](development/setup.md) | Node.js、指令、預覽、環境變數、main／production 發布流程。 |
| [程式碼架構](development/architecture.md) | 檔案職責、建置、模組依賴與資料流。 |
| [驗證指南](development/validation.md) | 檢查範圍、瀏覽器驗收及結果記錄方式。 |
| [委託服務](development/order-service.md) | GAS、Sheets、Telegram、部署設定與維護。 |
| [參考附件](development/reference-attachments.md) | 私人 Drive 上傳、預覽／下載、相簿通知與保留規則。 |
| [作品服務](development/artwork-service.md) | 作品草稿、Drive 暫存、Git 保存核對、production 發布與清理。 |
| [影片壓縮](development/video-optimization.md) | 原始影片、預覽／展示衍生版、首頁影片及素材驗證。 |
| [Trello 匯入](development/trello-import.md) | 歷史來源轉換、去重、備份、驗證與不發通知的界線。 |
| [公開倉庫與私人資料](development/publication.md) | 憑證、資源識別、素材、維運清單與提交前檢查。 |
| [工具與插件](development/plugins.md) | 依任務選工具，維持原生架構及既有託管。 |

## 資料規格與原始來源

| 文件 | 性質 |
| --- | --- |
| [委託表單與計價](reference/commission.md) | 現行欄位、費率、折扣順序與已確認差異。 |
| [JSON 草稿](reference/draft-schema.md) | 第 4 版欄位、型別、空值與未送件狀態。 |
| [委託 API](reference/order-api.md) | 收件、進度、管理、登入、32 欄 Orders 與相容規則。 |
| [收益報表](reference/revenue-report.md) | 三類收益、日期、完整快照、待補資料及 API。 |
| [作品與素材](reference/assets.md) | 原站基底、後台覆寫、來源與雜湊，區分基底數量和實際發布清單。 |
| [原始表單與交付條款](reference/source-forms.md) | 來源存檔，保留與本站不同的歷史費率及條款。 |

## 規劃與歷史

- [委託服務後續規劃](plans/form-integration.md)：尚未實作的維護與服務能力，已完成項目連到現行規格。
- [作品上傳原始設計](plans/artwork-upload.md)：保留設計取捨與當時方案，現行操作以作品服務文件為準。
- [歷史紀錄索引](records/README.md)：依日期列出全部驗收、部署及資料整理紀錄。

## 文件維護方式

README 保留功能概覽與入門。操作步驟放 development、介面放 design、契約與來源放 reference、方案放 plans、帶日期的實測放 records。同一份費率、欄位或來源清單只在主文件完整維護，其他文件以連結引用。

修改前先確認文件是現行規格或歷史證據。原始存檔不回寫新規則；歷史紀錄保留當時版本、數量與限制，補充新結果時另記日期。沒有重新讀取正式環境時，不把先前部署紀錄稱為即時現況。

Markdown 連結依所在文件解析；行內程式碼的專案路徑相對於專案根目錄。公開文件不記錄個人電腦路徑、憑證、訂單或私人雲端管理連結。
