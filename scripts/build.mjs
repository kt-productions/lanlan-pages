import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import path from "node:path";
import { root, output as out } from "./lib/paths.mjs";
import { readContent, readCommission } from "./lib/content.mjs";
import { siteAssetVersion } from "./lib/site-assets.mjs";
import { readVideoAssets, readHeroVideo } from "./lib/video-assets.mjs";
import { readArtworkCatalog } from "./lib/artworks.mjs";
import {
  escapeHtml as escape,
  inlineJson,
  renderTemplate,
} from "./lib/templates.mjs";

// 清理範圍固定由腳本位置推導，與呼叫端工作目錄無關。
if (out !== path.join(root, "dist")) throw new Error("不安全的建置目錄");
const site = await readContent("site.json");
const rawWorks = await readContent("works.json");
const videoAssets = await readVideoAssets(rawWorks);
const heroVideo = await readHeroVideo();
const commission = await readCommission();
const integration = await readContent("integration.json");
if (
  integration.apiUrl &&
  !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(
    integration.apiUrl,
  )
) {
  throw new Error(
    "integration.json 的 apiUrl 必須是 Apps Script 正式 Web App 網址。",
  );
}
const { works, manifest: artworkManifest } = await readArtworkCatalog(rawWorks, videoAssets);
const categories = { animation: "角色動畫", chibi: "小動圖", stickers: "貼圖" };
const siteUrl = new URL(
  process.env.SITE_URL || "http://127.0.0.1:4173/lanlan-pages/",
);
if (!siteUrl.pathname.endsWith("/")) siteUrl.pathname += "/";
const htmlWorks = works
  .map((work) => {
    const media =
      work.type === "video"
        ? `<video data-autoplay data-src="./${escape(work.previewSrc)}" data-poster="./${escape(work.poster)}" width="${work.width}" height="${work.height}" muted loop playsinline preload="none" aria-label="${escape(work.title)}"></video><noscript><img src="./${escape(work.poster)}" alt="${escape(work.title)}" width="${work.width}" height="${work.height}" loading="lazy" decoding="async"></noscript><span class="video-notice" hidden></span>`
        : `<img src="./${escape(work.poster)}" alt="${escape(work.alt || work.title)}" width="${work.width}" height="${work.height}" loading="lazy" decoding="async">`;
    return `<article class="artwork" data-id="${escape(work.id)}" data-category="${escape(work.category)}"><a class="art-link" href="./${escape(work.src)}" data-work="${escape(work.id)}" aria-label="放大${escape(work.title)}"><div class="art-image">${media}</div><div class="art-caption"><span class="art-category">${categories[work.category]}</span><span class="art-title">${escape(work.title)}</span><svg class="icon art-open" aria-hidden="true"><use href="#arrow-up-right"/></svg></div></a></article>`;
  })
  .join("\n");
const replacements = {
  TITLE: escape(site.title),
  DESCRIPTION: escape(site.description),
  SITE_URL: escape(siteUrl.href),
  COMMISSION_DATA: inlineJson({
    ...commission,
    serviceDescriptions: Object.fromEntries(
      site.services.map(({ id, description }) => [id, description]),
    ),
  }),
  COMMISSION_DESCRIPTION: escape(
    site.services.find(({ id }) => id === "animation").description,
  ),
  INTEGRATION_DATA: inlineJson({ apiUrl: integration.apiUrl || "" }),
  WORKS: htmlWorks,
  ARTWORK_PANEL: await readFile(path.join(root, "src/features/artworks/panel.html"), "utf8"),
  HERO_CHIBI_SRC: escape(videoAssets.get("chibi-01").preview.src),
  HERO_MAIN_SRC: escape(heroVideo.video.src),
  HERO_MAIN_POSTER: escape(heroVideo.poster.src),
  HERO_MAIN_TITLE: escape(heroVideo.title),
  HERO_MAIN_WIDTH: heroVideo.video.width,
  HERO_MAIN_HEIGHT: heroVideo.video.height,
  HERO_SIDE_SRC: escape(videoAssets.get("animation-01").preview.src),
  COUNT_ANIMATION: works.filter((work) => work.category === "animation").length,
  COUNT_CHIBI: works.filter((work) => work.category === "chibi").length,
  COUNT_STICKERS: works.filter((work) => work.category === "stickers").length,
  SERVICES: site.services
    .map(
      (s, i) =>
        `<article class="price-row"><span class="price-number">0${i + 1}</span><div><h3>${escape(s.name)}</h3><p>${escape(s.description)}</p></div><div class="price-amount">${s.prefix ? `<small class="price-prefix">${escape(s.prefix)}</small> ` : ""}${escape(s.price)}${s.suffix ? ` <small>${escape(s.suffix)}</small>` : ""}</div></article>`,
    )
    .join("\n"),
  SOCIALS: site.socials
    .map(
      (s) =>
        `<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="透過 ${escape(s.name)} 聯絡爛爛（另開視窗）">${escape(s.name)} <svg class="icon" aria-hidden="true"><use href="#arrow-up-right"/></svg></a>`,
    )
    .join("\n"),
  DATA: inlineJson({
    works: works.map(({ id, category, title, type, src, playbackSrc, poster, alt, animated, description }) => ({
      id,
      category,
      title,
      type,
      src,
      playbackSrc,
      poster,
      alt,
      animated,
      description,
    })),
    services: site.services,
  }),
};
const pages = [
  {
    file: "index.html",
    source: "home",
    title: site.title,
    description: site.description,
    url: siteUrl.href,
  },
  {
    file: "commission/index.html",
    source: "commission",
    title: "委託表單｜爛爛 LANLAN",
    description: "選擇貼圖包、角色動畫或小動圖，整理你的委託需求與角色設定。",
    url: new URL("commission/", siteUrl).href,
  },
  {
    file: "progress/index.html",
    source: "progress",
    title: "委託進度｜爛爛 LANLAN",
    description: "查看委託目前的製作狀態與進度。",
    url: new URL("progress/", siteUrl).href,
  },
  {
    file: "admin/index.html",
    source: "admin",
    title: "委託管理｜爛爛 LANLAN",
    description: "委託管理後台，僅供已授權的管理員使用。",
    url: new URL("admin/", siteUrl).href,
  },
];
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const allowedGifs = new Set(artworkManifest.items.flatMap(item => item.media?.assets.map(asset => asset.path) || []).filter(file => file.endsWith(".gif")));
await cp(path.join(root, "public"), out, {
  recursive: true,
  filter: (source) => !source.endsWith(".gif") || allowedGifs.has(path.relative(path.join(root, "public"), source).split(path.sep).join("/")),
});
// 保留來源模組相對位置；只複製 JS／CSS，不讓模板與開發文件進入網站。
const assetVersion = await siteAssetVersion(path.join(root, "src"));
await cp(path.join(root, "src"), path.join(out, "assets/site", assetVersion), {
  recursive: true,
  filter: (source) =>
    !path.extname(source) || [".js", ".css"].includes(path.extname(source)),
});
const partials = Object.fromEntries(
  await Promise.all(
    ["head", "icons", "header", "footer"].map(async (name) => [
      name.toUpperCase(),
      await readFile(path.join(root, "src/templates", name + ".html"), "utf8"),
    ]),
  ),
);
const redirectTemplate = await readFile(
  path.join(root, "src/templates/redirect.html"),
  "utf8",
);
for (const page of pages) {
  const template = await readFile(
    path.join(root, "src/pages", page.source, "index.html"),
    "utf8",
  );
  const navigation = [
    { source: "home", route: "", label: "首頁" },
    { source: "commission", route: "commission/", label: "委託表單" },
    { source: "progress", route: "progress/", label: "委託進度" },
    { source: "admin", route: "admin/", label: "委託管理" },
  ];
  // 子頁使用目錄首頁；明確回到網站根目錄，不用 base 改變頁內錨點。
  const rootPrefix = page.source === "home" ? "./" : "../";
  const data = {
    ...replacements,
    ROOT: rootPrefix,
    ASSET_VERSION: assetVersion,
    PAGE: page.source,
    ROBOTS:
      page.source === "admin"
        ? '<meta name="robots" content="noindex,nofollow" />'
        : "",
    PRELOAD:
      page.source === "home"
        ? '<link rel="preload" href="./assets/posters/animation-02.webp" as="image" fetchpriority="high" />'
        : "",
    FOOTER_HOME: page.source === "home" ? "#about" : rootPrefix,
    TITLE: escape(page.title),
    DESCRIPTION: escape(page.description),
    PAGE_URL: escape(page.url),
    NAV_LINKS: navigation
      .map(
        (item) =>
          `<a href="${rootPrefix}${item.route}"${item.source === "admin" ? " data-admin-link hidden" : ""}${item.source === page.source ? ' aria-current="page"' : ""}>${item.label}</a>`,
      )
      .join(""),
  };
  for (const [key, partial] of Object.entries(partials))
    data[key] = renderTemplate(partial, data);
  const html = renderTemplate(template, data);
  await mkdir(path.dirname(path.join(out, page.file)), { recursive: true });
  await writeFile(path.join(out, page.file), html);
  if (page.source !== "home") {
    await writeFile(
      path.join(out, page.source + ".html"),
      renderTemplate(redirectTemplate, data),
    );
  }
}
await writeFile(path.join(out, ".nojekyll"), "");
await writeFile(path.join(out, "release.json"), JSON.stringify({ commitSha: /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || "") ? process.env.GITHUB_SHA : null }) + "\n");
await writeFile(
  path.join(out, "robots.txt"),
  `User-agent: *\nAllow: /\nSitemap: ${siteUrl.href}sitemap.xml\n`,
);
await writeFile(
  path.join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages
    .filter((page) => page.source !== "admin")
    .map((page) => `<url><loc>${escape(page.url)}</loc></url>`)
    .join("")}</urlset>\n`,
);
await writeFile(
  path.join(out, "404.html"),
  `<!doctype html><html lang="zh-Hant-TW"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>這裡還沒有作品｜爛爛</title><style>body{background:#f5edc5;color:#46301f;font-family:system-ui;text-align:center;padding:15vh 24px}a{color:#765039}</style><h1>這裡還沒有作品 óωò</h1><p>也許你想找的是另一個小角落。</p><a href="${escape(siteUrl.pathname)}">回到爛爛的作品集 ↗</a></html>`,
);
console.log(`已建置 ${works.length} 件作品至 dist；網站位置：${siteUrl.href}`);
