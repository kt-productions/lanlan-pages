# 開發指南

使用 Node.js 22 以上；CI 固定使用 Node.js 24。在專案根目錄先執行 `npm ci`，安裝鎖定的後端打包依賴。前端沒有第三方執行期套件；協作及外部操作規則見 [AGENTS.md](../../AGENTS.md)。

## 本機預覽

```sh
npm run dev
```

指令先建置再提供 <http://127.0.0.1:4173/lanlan-pages/>，也支援網域根路徑。伺服器只監聽 `127.0.0.1`，沒有熱更新；修改來源後另執行 `npm run build` 並重新整理。

只提供既有產物時使用 `npm run preview`，它不會重新建置。代理啟動任何預覽服務前須依 AGENTS 確認授權；一般文件維護不需啟動。

五個頁面目錄及收益檢視見[README 入口表](../../README.md#功能與入口)。`dist/` 可重建，不直接修改。

## 指令與環境變數

| 指令 | 用途 |
| --- | --- |
| `npm test` | 先打包 GAS，再跑離線單元／契約測試。 |
| `npm run build` → `npm run check` | 產生網站後核對素材、資源、模組與產物。 |
| `npm run build:backend` | 產生 `build/apps-script/`，不連線或部署。 |
| `npm run test:media` | 作品媒體整合測試，需要 ffmpeg／ffprobe。 |
| `npm run optimize:videos`、`npm run optimize:hero` | 重建影片衍生素材；規則見[影片壓縮](video-optimization.md)。 |

| 環境變數 | 使用時機與用途 |
| --- | --- |
| `PORT` | 預覽埠，預設 4173。 |
| `SITE_URL` | 建置 canonical、sitemap 與 404；預設 `http://127.0.0.1:4173/lanlan-pages/`。 |
| `FFMPEG_PATH`、`FFPROBE_PATH` | 媒體工具的執行檔；未設定時由 PATH 尋找。 |

更換 PORT 不會自動更換 SITE_URL；需要一致時在建置前設定。專案不要求 `.env`。作品 workflow 使用的其他變數與 Secrets 見[作品服務](artwork-service.md)，不得放入公開 JSON。

本機網站若沿用正式 `content/integration.json`，操作 API 仍可能連到正式資料。互動驗收使用虛構資料與攔截 API 的測試環境；「localhost」本身不代表訂單或通知是測試資料。

## 後端建置與部署

`build/apps-script/` 與網站 dist 分開；共用計價、契約及收益規則會打包到 GAS。原始碼位於 `backend/apps-script/` 與共用前端模組，不在雲端另改費率。設定、clasp 白名單、授權及版本更新見[委託服務](order-service.md)。

Pages 不會部署 GAS 或修改 Script Properties。前後端契約有變更時，先部署向後相容的 GAS，再發布前端；收益報表無須遷移 Sheets。

## GitHub Pages 發布

倉庫為 [kt-productions/lanlan-pages](https://github.com/kt-productions/lanlan-pages)，網站為 [LanLan Pages](https://kt-productions.github.io/lanlan-pages/)。目前 workflow 的責任如下：

| workflow | 觸發與責任 |
| --- | --- |
| `validate.yml` | main push／指向 main 的 PR；測試、建置及產物檢查。 |
| `artworks.yml` | 手動或排程；僅 main 且作品服務啟用時執行。處理已授權作品工作、核對保存並推進 production。 |
| `pages.yml` | production push，或在 production 手動執行；測試、建置、部署及發布版本核對。 |

main 是開發與來源保存分支，production 是發布分支。維護者完成必要檢查後，將 production 正常快轉至要發布的 main 提交；分支分歧時停止釐清，不 force push，也不直接在 production 修改檔案。推 main 本身不代表網站已更新。作品工作也會推進 production，因此發布前須核對 main 中其他尚待部署的程式及 GAS 相容性。

Pages 來源設定為 GitHub Actions，environment 限 production。workflow 固定 checkout 事件 SHA，以 `actions/configure-pages` 提供的網址建置；只有 dist 上傳為網站產物，後端、文件及私人設定不在其中。部署前排除已被較新 production 取代的版本，完成後核對 `release.json`。

作品工作使用 GitHub App token 更新 production，以觸發部署；相同 SHA 的重試由現有工具明確 dispatch Pages。設定及故障復原見[作品服務](artwork-service.md)。需回復程式時建立可追蹤的還原提交，保留作品來源與資料歷史，不手改 dist 或清空雲端資料。

以上描述目前工作樹設定；過去正式驗收及未確認項目見[現況對照](current-state.md)，不因文件列出步驟就構成部署或真實資料操作的授權。
