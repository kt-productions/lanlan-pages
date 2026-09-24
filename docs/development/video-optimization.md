# 影片壓縮與延遲載入

94 支作品保留三個用途不同的版本，原始資料仍以 `content/works.json` 為準。

| 版本 | 位置與設定 | 載入時機 |
| --- | --- | --- |
| 原始檔 | `public/assets/videos/`，原始大小與 SHA-256 不變 | 一般播放不使用；無 JavaScript 或另開原始媒體連結時可存取 |
| 預覽版 | `public/assets/videos/optimized/`；長邊最多 640px、H.264 CRF 26 | 首屏或作品影片實際進入視窗，且允許動畫時才設定 `src` |
| 展示版 | 同上；長邊最多 1280px、H.264 CRF 23 | 開啟作品檢視器、切換上一件／下一件時才設定該件來源 |

兩種衍生版均維持比例、不放大較小來源、不裁切，保留原影格率、影格數與音軌。影片採 `yuv420p` 與 `+faststart`，網址帶內容雜湊以避免版本快取混用。設定集中於 `scripts/lib/video-assets.mjs`；原始影片及 `content/works.json` 不由壓縮指令覆寫。

## 產生或更新

需要 Node.js 22 以上，以及支援 libx264 的 FFmpeg 和 ffprobe。工具可置於 PATH；不在 PATH 時分別設定 `FFMPEG_PATH`、`FFPROBE_PATH` 為執行檔位置。

```sh
npm run optimize:videos
npm run build
npm run check
```

壓縮指令先核對所有來源的大小與 SHA-256，另存衍生檔並更新 `content/video-assets.json`。清單記錄編碼器、參數、原始來源及每個版本的大小、雜湊、尺寸、片長和影格資訊。已有相同來源、參數及有效雜湊的版本會重用；參數變更則重新編碼。整批完成後才替換清單，失敗不覆寫上一份清單。

新增作品時先依[素材維護](architecture.md)建立來源、影片與縮圖，再執行上述指令。一般建置與 GitHub Pages CI 直接使用已產生的衍生檔，不需要安裝 FFmpeg。提交影片變更時，需一併包含清單、衍生檔與相關程式；舊的衍生檔不自動刪除，確認不再引用後再另行整理。

## 載入與播放

### 首頁中央 GIF

2026-09-24 使用者另提供 `public/assets/videos/逼餔撩髮2.gif` 作為首頁中央影片。此素材獨立於 94 支作品清單，以 `content/hero-video.json` 記錄來源、雜湊、編碼與縮圖；不改動 `animation-02` 原作品。

執行 `npm run optimize:hero` 可重新產生專用 MP4 與 JPEG 首格縮圖，沿用 `FFMPEG_PATH`、`FFPROBE_PATH`。影片採 960px 長邊、H.264 CRF 23、`yuv420p`、faststart；GIF 的 80／90ms 影格使用 `-fps_mode passthrough -enc_time_base 1/100 -video_track_timescale 1000` 保留，轉檔後逐格核對時間戳、12 格與 1 秒片長。縮圖採 JPEG 品質參數 3。編碼器需提供 `libx264` 及 `mjpeg`，一般建置和 CI 不執行轉檔。

原 GIF 為 6,010,209 bytes，MP4 為 182,465 bytes，縮圖為 55,611 bytes；加上縮圖仍減少約 96% 傳輸量。原 GIF 保留不覆寫，建置排除此首頁來源 GIF；後台受管作品 GIF 依作品清單另行打包。網頁只使用帶雜湊版本的 MP4 和縮圖。`readHeroVideo()` 於建置／檢查時核對來源與衍生檔，並確認比例、尺寸、片長、影格數及起播索引。

同日於本機 1280 × 900 與 390 × 844 驗證新影片載入、循環、桌機暫停／恢復、手機完整比例及無橫向溢出；主控台無警告或錯誤。原 GIF 與 MP4 的全部影格時間戳一致，建置與靜態檢查通過。發布沿用既有 GitHub Pages workflow，GAS 不需更新。

### 共用播放行為

- 背景影片只有 `data-src` 和 `preload="none"`，由播放模組判斷可見性後設定 `src`；不使用會繞過播放狀態的原生 `autoplay` 屬性。
- 首屏三張縮圖保留即時載入，作品縮圖使用 `data-poster`，距離視窗 200px 時才載入。影片本體仍需進入可見範圍。
- 離開畫面、切換分類、暫停動畫、隱藏分頁及開啟檢視器時，背景影片暫停。未緩衝完成的影片移除來源並中止下載；已完整緩衝的影片保留以便返回。
- 減少動態或瀏覽器省流量偏好預設不下載背景影片，訪客可手動啟動。減少動態時，檢視器保留縮圖與原生控制，按播放鍵才下載。
- 不支援 IntersectionObserver 時改用節流的捲動／尺寸事件判斷可見範圍，不一次載入所有作品。無 JavaScript 時使用延遲載入圖片與原始媒體連結。

`npm run check` 核對原始與衍生雜湊、尺寸比例、片長、大小、MP4 起播索引、產物位元組，以及頁面使用壓縮版。實際是否只下載可見影片、展開才下載展示版，仍須在瀏覽器以冷快取請求確認。

編碼參數依 [FFmpeg 文件](https://ffmpeg.org/ffmpeg-all.html)；瀏覽器預載與縮圖行為參照 [MDN video](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video)。
