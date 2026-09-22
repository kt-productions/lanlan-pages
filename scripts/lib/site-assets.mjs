import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

// 整個模組樹共用內容版本；巢狀相對匯入也會取得新網址，避免部署後混用舊模組。
export async function siteAssetVersion(directory) {
  const files = [];
  async function collect(relative = "") {
    for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) await collect(file);
      else if (entry.isFile() && [".js", ".css"].includes(path.extname(file))) files.push(file);
    }
  }
  await collect();
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    const bytes = await readFile(path.join(directory, file));
    hash.update(file.split(path.sep).join("/")).update("\0");
    hash.update(String(bytes.length)).update("\0").update(bytes);
  }
  return hash.digest("hex").slice(0, 16);
}
