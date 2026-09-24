import { readFile, stat, readdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { root, output, resolveWithin } from "./lib/paths.mjs";
import { siteAssetVersion } from "./lib/site-assets.mjs";
import { readVideoAssets, readHeroVideo } from "./lib/video-assets.mjs";
import { readArtworkCatalog } from "./lib/artworks.mjs";
const assetRoot = path.join(output, "assets/site", await siteAssetVersion(path.join(root, "src")));
const works = JSON.parse(
  await readFile(path.join(root, "content/works.json"), "utf8"),
);
const site = JSON.parse(
  await readFile(path.join(root, "content/site.json"), "utf8"),
);
const videoAssets = await readVideoAssets(works);
const { works: catalogWorks, manifest: artworkManifest } = await readArtworkCatalog(works, videoAssets);
for (const item of artworkManifest.items) {
  for (const asset of item.media?.assets || []) {
    const bytes = await readFile(resolveWithin(output, asset.path));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256, "作品素材未正確輸出");
  }
}
const heroVideo = await readHeroVideo();
for (const kind of ["video", "poster"]) {
  const bytes = await readFile(resolveWithin(output, heroVideo[kind].src));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), heroVideo[kind].sha256,
    `首頁 ${kind} 未正確輸出`);
}
for (const asset of videoAssets.values()) {
  for (const kind of ["preview", "display"]) {
    assert.equal(
      createHash("sha256")
        .update(await readFile(resolveWithin(output, asset[kind].src)))
        .digest("hex"),
      asset[kind].sha256,
      `${asset.id} ${kind} 壓縮版未正確輸出`,
    );
  }
}
assert.equal(
  new Set(works.map((w) => w.id)).size,
  works.length,
  "作品 ID 不可重複",
);
assert.ok(works.length > 0, "作品清單不可為空");
for (const work of works) {
  assert.ok(
    site.services.some((s) => s.id === work.category),
    `${work.id} 找不到對應委託類型`,
  );
  for (const field of ["src", "poster"]) {
    const resolved = path.resolve(root, "public", work[field]);
    assert.ok(
      resolved.startsWith(path.join(root, "public") + path.sep),
      "資源不可跳出 public",
    );
    const info = await stat(resolved);
    assert.ok(
      info.size > 0 && info.size < 100 * 1024 * 1024,
      `${work.id} ${field} 檔案大小不合適`,
    );
  }
  assert.ok(
    work.width > 0 && work.height > 0 && work.duration > 0,
    `${work.id} 媒體資訊有誤`,
  );
}
for (const entry of [
  ...site.services.map((s) => s.form),
  ...site.socials.map((s) => s.url),
])
  assert.equal(new URL(entry).protocol, "https:");
for (const id of site.featured)
  assert.ok(
    works.some((w) => w.id === id),
    `缺少精選作品 ${id}`,
  );
const html = await readFile(path.join(root, "dist/index.html"), "utf8");
const commissionHtml = await readFile(
  path.join(root, "dist/commission/index.html"),
  "utf8",
);
const pages = { "index.html": html, "commission/index.html": commissionHtml };
for (const file of ["progress/index.html", "admin/index.html", "artworks/index.html"]) {
  pages[file] = await readFile(path.join(output, file), "utf8");
}
for (const [file, page] of Object.entries(pages)) {
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(page), `${file} 模板替換不完整`);
  const idList = [...page.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const ids = new Set(idList);
  assert.equal(ids.size, idList.length, `${file} 不可有重複的 DOM ID`);
  for (const [, resource, fragment] of page.matchAll(
    /(?:src|href|poster)="(\.{1,2}\/[^"#?]*)(?:#([^"]+))?"/g,
  )) {
    const target = resolveWithin(
      output,
      path.join(path.dirname(file), resource),
    );
    const info = await stat(target);
    const targetFile = info.isDirectory()
      ? path.join(target, "index.html")
      : target;
    assert.ok(
      (await stat(targetFile)).isFile(),
      `${file} 資源不是檔案：${resource}`,
    );
    assert.ok(!/\.html(?:$|[?#])/.test(resource), `${file} 仍連往 HTML 檔名`);
    if (fragment) {
      assert.ok(
        (await readFile(targetFile, "utf8")).includes(`id="${fragment}"`),
        `${file} 找不到 ${resource}#${fragment}`,
      );
    }
  }
  const canonical = page.match(/<link rel="canonical" href="([^"]+)"/)[1];
  assert.ok(
    new URL(canonical).pathname.endsWith("/"),
    `${file} canonical 必須是目錄網址`,
  );
  if (file !== "index.html") {
    const legacy = await readFile(
      path.join(output, path.dirname(file) + ".html"),
      "utf8",
    );
    assert.ok(!/\{\{[A-Z_]+\}\}/.test(legacy), "舊頁面轉址模板替換不完整");
    assert.ok(legacy.includes(`href="${canonical}"`), "新舊頁面 canonical 不一致");
    assert.ok(legacy.includes(`href="./${path.dirname(file)}/"`), "缺少舊頁面轉址目標");
  }
  for (const match of page.matchAll(/href="#([^"]+)"/g))
    assert.ok(ids.has(match[1]), `${file} 找不到錨點 ${match[1]}`);
  assert.ok(
    !/<a\b[^>]*href="https:\/\/(?:forms\.gle|docs\.google\.com\/forms)/.test(
      page,
    ),
    "新版不可再連往舊 Google 表單",
  );
}
assert.ok(
  !(await readFile(path.join(output, "sitemap.xml"), "utf8")).includes(".html"),
  "sitemap 不應列出舊 HTML 網址",
);
assert.equal([...html.matchAll(/class="artwork"/g)].length, catalogWorks.length);
assert.equal(
  [...html.matchAll(/<video\b/g)].length,
  catalogWorks.filter(work => work.type === "video").length + 3,
  "所有影片作品與首屏三件作品皆應使用影片元素",
);
for (const [video] of html.matchAll(/<video\b[^>]*>/g)) {
  for (const attribute of ["data-autoplay", "muted", "loop", "playsinline"])
    assert.match(
      video,
      new RegExp(`\\b${attribute}(?:\\s|>)`),
      `影片缺少 ${attribute}`,
    );
  assert.ok(!/\ssrc=|\sautoplay(?:\s|>)/.test(video), "背景影片必須由可見性控制載入與播放");
  assert.ok(video.includes('preload="none"'), "背景影片不可預載");
  assert.ok(video.includes("assets/videos/optimized/") || video.includes("/preview.mp4"), "背景影片必須使用壓縮版");
  if (video.includes("data-poster="))
    assert.ok(!/\sposter=/.test(video), "作品縮圖必須延遲載入");
}
const portfolio = JSON.parse(html.match(/<script id="portfolio-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
for (const work of portfolio.works.filter((item) => item.type === "video"))
  assert.equal(work.playbackSrc, catalogWorks.find(item => item.id === work.id).playbackSrc, "檢視器必須使用壓縮版");
const previewSources = new Set([...videoAssets.values()].map((item) => `./${item.preview.src}`));
for (const work of catalogWorks.filter(item => item.type === "video")) previewSources.add(`./${work.previewSrc}`);
previewSources.add(`./${heroVideo.video.src}`);
for (const [, source] of html.matchAll(/<video\b[^>]*data-src="([^"]+)"/g))
  assert.ok(previewSources.has(source), "背景影片不可使用展示版或原始檔");
const formAssets = JSON.parse(
  await readFile(path.join(root, "content/form-assets.json"), "utf8"),
);
for (const asset of formAssets) {
  const resolved = resolveWithin(root, asset.path);
  const bytes = await readFile(resolved);
  assert.equal(bytes.length, asset.bytes, `${asset.path} 大小不符`);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    asset.sha256,
    `${asset.path} 雜湊不符`,
  );
}
const commission = JSON.parse(
  commissionHtml.match(
    /<script id="commission-data" type="application\/json">([\s\S]*?)<\/script>/,
  )[1],
);
for (const option of commission.stickerOptions) {
  const image = await stat(path.join(root, "dist", option.image));
  assert.ok(
    image.size > 0 && Number.isFinite(option.price),
    `貼圖 ${option.number} 缺少圖片或價格`,
  );
}

// 搬移來源後，HTML 第一層資源存在並不代表 ES Module 的相對匯入仍然有效。
// 同時核對輸出與來源位元組，避免舊 dist 恰好仍能通過存在性檢查。
async function checkModules(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await checkModules(file);
      continue;
    }
    assert.ok(
      [".js", ".css"].includes(path.extname(file)),
      `不應輸出來源模板：${file}`,
    );
    const source = await readFile(file, "utf8");
    const relative = path.relative(assetRoot, file);
    assert.equal(
      source,
      await readFile(resolveWithin(path.join(root, "src"), relative), "utf8"),
      `產物未更新：${relative}`,
    );
    if (file.endsWith(".js")) {
      // 目前使用靜態 import；僅允許相對模組，不引入第三方執行期。
      for (const [, imported] of source.matchAll(
        /^\s*import\s+(?:[\w*{},\s]+from\s+)?["']([^"']+)["']/gm,
      )) {
        assert.ok(
          imported.startsWith("."),
          `模組必須使用相對路徑：${imported}`,
        );
        const dependency = resolveWithin(
          output,
          path.relative(output, path.resolve(path.dirname(file), imported)),
        );
        assert.ok(
          (await stat(dependency)).isFile(),
          `缺少匯入模組：${imported}`,
        );
      }
    }
  }
}
await checkModules(assetRoot);
async function artifactBytes(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    total += entry.isDirectory() ? await artifactBytes(file) : (await stat(file)).size;
  }
  return total;
}
assert.ok(await artifactBytes(output) <= 900 * 1024 * 1024, "網站產物超過 900 MiB 預留上限，請先處理容量再發布");
console.log(
  `驗證通過：${works.length} 支影片、${formAssets.length} 筆表單素材來源、${commission.stickerOptions.length} 款選項、靜態資源、模組依賴、產物一致性、分類與站內錨點。`,
);
