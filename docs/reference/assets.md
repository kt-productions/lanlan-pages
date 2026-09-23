# 原站盤點與素材來源

盤點與規格核對日期：2026-09-22。來源紀錄保存在本機 JSON 與原始素材中；本文件區分原站盤點與目前顯示資料，驗證範圍見[歷史核對](../records/verification-2026-09-22.md)。

## 原站頁面與本機對應

| 原頁 | 原始盤點與目前保存位置 |
| --- | --- |
| [首頁](https://asrielyangyang.wixsite.com/lanlan-cm-display) | 個人介紹、貼圖／角色動畫／小動圖與其他委託、三個表單及三個社群連結；本站整理為首頁介紹、價目與聯絡區。 |
| [角色動畫](https://asrielyangyang.wixsite.com/lanlan-cm-display/animation) | 37 個不同來源影片 URL，保存為 `animation-01` 至 `animation-37`。 |
| [小動圖](https://asrielyangyang.wixsite.com/lanlan-cm-display/%E5%89%AF%E6%9C%AC-%E8%A7%92%E8%89%B2%E5%8B%95%E7%95%AB%E5%B1%95%E7%A4%BA) | 57 個不同來源影片 URL，保存為 `chibi-01` 至 `chibi-57`。 |

原始盤點另記錄首頁的 `services-1` 別名，以及與作品重複的頁首背景；當時未找到獨立履歷、委託規則或聯絡子頁。移轉時以不同影片來源 URL 去重，不因畫面相似就刪除不同 URL 的作品。

三份 Google 表單包含小動圖中英文流程及角色動畫閱讀確認分支，原始文字保存在 `content/forms/`；欄位、價格與使用者後續決策見[表單規格](commission.md)與[原始表單](source-forms.md)。

## 作品資料與顯示名稱

[作品清單](../../content/works.json)目前包含 94 支 MP4，共 121,048,684 bytes；2026-09-22 文件核對時加總來源紀錄與實體檔案大小，兩者一致。每筆資料保存穩定 ID、分類、顯示標題、來源 URL、來源頁面、本機影片與縮圖路徑、尺寸、片長、位元組及 SHA-256。

目前顯示名稱並非全部使用類別編號。以下五筆已有名稱，其他 89 筆仍使用類別與編號；修改時以 `content/works.json` 的 `title` 為準，不把名稱退回初始盤點的編號。

| 作品 ID | 目前 `title` |
| --- | --- |
| `animation-01`、`animation-02` | 逼餔 |
| `animation-03` | 普特 |
| `animation-04` | 乾太 |
| `animation-06` | 星夜 |

舊盤點記錄原站播放器顯示預設的「Your Video Title」，因此初期採中性編號。現有 `title` 是本站顯示資料，不據此推定原站正式作品名、委託人或其他角色身分。首屏影片的替代說明仍由 `src/pages/home/index.html` 單獨維護。

2026-09-24 使用者確認作品編號越大越新，作品牆由 `scripts/build.mjs` 依 ID 的數字部分由大到小排列；同號保留來源順序。各分類、載入更多與檢視器共用此順序，不另推定完成日期。`content/site.json` 的 `featured` 保留原精選紀錄，但不再影響作品牆排序。首屏兩側固定為 `chibi-01`、`animation-01`；同日依使用者要求，中央改為新提供的「逼餔撩髮」GIF 衍生影片。

建置另加入 `stickers-01` 貼圖總覽，因此作品牆共 95 件，分類件數為角色動畫 37、小動圖 57、貼圖 1；「貼圖 1」代表一張總覽，不代表只有一款可委託。依使用者同日後續要求，移除「全部作品」選項，預設顯示小動圖。

## 原始素材與建置範圍

2026-09-23 依使用者公開前整理要求，專案只保留目前網站使用的素材；未開放及未使用的 16 個檔案已移出專案，移除前副本與完整來源紀錄保存於專案外。保留素材未重新編碼、裁切或改寫。

| 資料／目錄 | 目前內容與用途 |
| --- | --- |
| `public/assets/videos/` | 94 支原始 MP4，以及使用者提供的 `逼餔撩髮2.gif`；保留來源供後續操作。 |
| `public/assets/videos/optimized/`、`content/video-assets.json` | 2026-09-23 另存 94 支預覽版與 94 支展示版；記錄對應原始來源、編碼設定、大小、尺寸、片長與 SHA-256。原始影片及 `works.json` 保留不變。 |
| `public/assets/posters/` | 94 張影片 WebP 縮圖及 1 張貼圖總覽縮圖；網站以完整比例呈現。 |
| `content/hero-video.json` | 首頁中央專用來源紀錄；原 GIF 6,010,209 bytes、1920 × 1080、1 秒／12 格。另存 960 × 540 H.264 MP4（182,465 bytes）及 JPEG 縮圖（55,611 bytes），素材網址含 SHA-256 前綴。未加入作品牆或變更原作品 ID。 |
| `content/source-assets.json`、`public/assets/originals/` | 1 筆首頁原始素材：`stickers.png`，原名 `R8R8.png`，作品牆的貼圖總覽原圖。 |
| `content/form-assets.json` | 50 筆使用中素材來源紀錄，對應 50 個專案相對路徑。 |
| `public/assets/forms/` | 48 張貼圖款式圖、1 張折扣圖、1 張中文交付說明圖。 |
| `public/favicon.svg` | 共用頁籤圖示。 |

以下說明圖於 2026-09-23 加入委託表單，本次保留：

| 素材 | 尺寸 | 表單用途 |
| --- | --- | --- |
| `public/assets/forms/sticker-discounts.png` | 720 × 383 | 第一步貼圖包款式選項前的數量折扣說明。 |
| `public/assets/forms/chibi-03.png` | 740 × 457 | 第一步小動圖方案選項前的 PNG、去背 PNG、MP4、GIF 交付格式說明；與同名作品影片 `videos/chibi-03.mp4` 不同。 |

移除範圍為未開放的兩款圖片、三張未引用的貼圖總覽、兩張未使用的小動圖來源圖、三個首頁原始 GIF，以及六個僅供存檔的表單素材。相關來源清單同步移出這些項目；原始證據保存在私人副本，不再隨公開倉庫發布。

建置會複製 `public/`，既有邏輯排除 `.gif`；`docs/` 不打包。2026-09-22 的歷史驗收數量反映當時內容，不能當成目前素材清單；現況以此表及 JSON 清單為準。

新增作品的步驟見[內容維護](../development/architecture.md)，首頁展示價目與表單計價的差異見[委託規格](commission.md)。作品與角色權利仍由原權利人持有；網站移轉不構成作品再利用或再授權許可。
