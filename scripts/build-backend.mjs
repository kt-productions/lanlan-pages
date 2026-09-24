import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { root } from "./lib/paths.mjs";
import { readCommission, readContent } from "./lib/content.mjs";
import { stickerWork } from "./lib/artworks.mjs";
import { backendSource } from "./lib/backend-source.mjs";

// 後端產物獨立於 dist，避免把程式或未來設定一起發布到 Pages。
const out = path.join(root, "build/apps-script");
await mkdir(out, { recursive: true });
const read = (file) => readFile(path.join(root, file), "utf8");
const pricing = backendSource(await read("src/features/commission/pricing.js"));
const contract = backendSource(await read("src/features/orders/contract.js"));
const attachments = backendSource(await read("src/features/orders/attachment-contract.js"));
const revenue = backendSource(await read("src/features/orders/revenue.js"));
const workflowDates = backendSource(await read("src/features/orders/workflow-dates.js"));
const core = `var Core_ = (() => {\n${pricing}\n${attachments}\n${contract}\n${revenue}\n${workflowDates}\nreturn { ORDER_STATUSES, OrderError, requireValue, validateSubmission, validateUpdate, publicOrder, orderWorkflow, orderSource, compareOrderAge, attachmentManifest, attachmentFileError, formatPriceRange, taipeiDate, buildRevenueReport, workflowDateDefaults, ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_FILES, ATTACHMENT_TYPES, API_MAX_REQUEST_CHARS };\n})();\n`;
await writeFile(path.join(out, "Core.gs"), core);
const artworks = backendSource(await read("src/features/artworks/contract.js"));
await writeFile(
  path.join(out, "ArtworkCore.gs"),
  `var ArtworkCore_ = (() => {\n${artworks}\nreturn { ARTWORK_TYPES, ARTWORK_MAX_BYTES, artworkFields, artworkFile, artworkMime, artworkOperation, mergeArtworks };\n})();\n`,
);
await writeFile(
  path.join(out, "ArtworkBase.gs"),
  `const ARTWORK_BASE_ = ${JSON.stringify([...(await readContent("works.json")), stickerWork])};\n`,
);
await writeFile(
  path.join(out, "Config.gs"),
  `const COMMISSION_CONFIG_ = ${JSON.stringify(await readCommission())};\n`,
);
const forge = await read("node_modules/node-forge/dist/forge.min.js");
await writeFile(
  path.join(out, "Forge.gs"),
  `// node-forge 1.4.0；授權見同目錄 THIRD_PARTY_LICENSE.txt。只用於後端 RS256 驗證。\nvar Forge_ = (function () { var window = {};\n${forge}\nreturn window.forge;\n})();\n`,
);
await copyFile(
  path.join(root, "node_modules/node-forge/LICENSE"),
  path.join(out, "THIRD_PARTY_LICENSE.txt"),
);
for (const file of [
  "Auth.gs",
  "Orders.gs",
  "Attachments.gs",
  "DriveStorage.gs",
  "AttachmentNotifications.gs",
  "NotificationText.gs",
  "Import.gs",
  "Bridge.gs",
  "Web.gs",
  "Artworks.gs",
  "ArtworkGitHub.gs",
  "ArtworkWorker.gs",
  "appsscript.json",
]) {
  await copyFile(path.join(root, "backend/apps-script", file), path.join(out, file));
}
console.log("已產生 build/apps-script；尚未部署或連線外部服務。");
