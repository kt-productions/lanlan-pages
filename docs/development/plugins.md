# 專案工具與插件

LanLan Pages 使用原生 HTML／CSS／JavaScript 與 Node.js 靜態建置。工具選擇依任務需求，完整協作規則見 [AGENTS.md](../../AGENTS.md)。

| 工具 | 適用工作 |
| --- | --- |
| Build Web Apps | 新介面或重新設計使用 frontend-app-builder；操作、響應式與渲染驗收使用 frontend-testing-debugging。 |
| GitHub MCP／gh | 倉庫、PR、Actions 操作；是否推送或發布仍依專案授權。 |
| 瀏覽器工具 | 在具備預覽授權後檢查桌機、手機、鍵盤與媒體互動；可用能力以工作階段為準。 |
| 檔案與 shell 工具 | Markdown、內容盤點、建置與相關檢查；一般文件整理不需 Word／PDF 插件。 |

設計概念以[介面文字規格](../design/interface.md)維護。正式作品沿用原始素材，不因插件預設改成 React、Vite 或新的託管方案。Apps Script 後端依[委託服務設定](order-service.md)維護。

`.codex/config.toml` 指定本專案使用的插件項目，不是工具白名單，也不能取代外部服務授權。開始工作時先定位專案根目錄並讀取準則，不假設父目錄工作階段已載入子專案設定。

插件保留單一有效來源，不直接修改載入快取；升級前依維護者自己的設定備份並比較版本。一般專案任務不順手升級插件。個人安裝清單、登入狀態、使用者目錄與備份位置由維護者私下保存，不寫入專案文件。
