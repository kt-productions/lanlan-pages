import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { root } from "./lib/paths.mjs";
import { readCommission } from "./lib/content.mjs";

// 後端產物獨立於 dist，避免把程式或未來設定一起發布到 Pages。
const out = path.join(root, "build/apps-script");
await mkdir(out, { recursive: true });
const read = (file) => readFile(path.join(root, file), "utf8");
const pricing = (await read("src/features/commission/pricing.js")).replace(
  /^export /gm,
  "",
);
const contract = (await read("src/features/orders/contract.js"))
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/^export /gm, "");
const attachments = (await read("src/features/orders/attachment-contract.js")).replace(/^export /gm, "");
const core = `var Core_ = (() => {\n${pricing}\n${attachments}\n${contract}\nreturn { ORDER_STATUSES, OrderError, requireValue, validateSubmission, validateUpdate, publicOrder, orderWorkflow, orderSource, attachmentManifest, attachmentFileError, formatPriceRange, ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_FILES, ATTACHMENT_TYPES, API_MAX_REQUEST_CHARS };\n})();\n`;
await writeFile(path.join(out, "Core.gs"), core);
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
for (const file of ["Auth.gs", "Orders.gs", "Attachments.gs", "AttachmentNotifications.gs", "NotificationText.gs", "Import.gs", "Bridge.gs", "Web.gs", "appsscript.json"]) {
  await copyFile(
    path.join(root, "backend/apps-script", file),
    path.join(out, file),
  );
}
console.log("已產生 build/apps-script；尚未部署或連線外部服務。");
