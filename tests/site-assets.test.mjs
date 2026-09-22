import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { siteAssetVersion } from "../scripts/lib/site-assets.mjs";

test("資源版本穩定，巢狀模組或樣式改變會更新完整模組樹網址", async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "lanlan-assets-"));
  try {
    await mkdir(path.join(fixture, "nested"));
    await writeFile(path.join(fixture, "index.js"), 'import "./nested/api.js";');
    await writeFile(path.join(fixture, "nested/api.js"), "export const version = 1;");
    await writeFile(path.join(fixture, "style.css"), "body { color: black; }");
    const initial = await siteAssetVersion(fixture);
    assert.match(initial, /^[a-f0-9]{16}$/);
    assert.equal(await siteAssetVersion(fixture), initial);
    await writeFile(path.join(fixture, "index.html"), "<p>模板不屬於快取模組</p>");
    assert.equal(await siteAssetVersion(fixture), initial);
    await writeFile(path.join(fixture, "nested/api.js"), "export const version = 2;");
    const changedModule = await siteAssetVersion(fixture);
    assert.notEqual(changedModule, initial);
    await writeFile(path.join(fixture, "style.css"), "body { color: white; }");
    assert.notEqual(await siteAssetVersion(fixture), changedModule);
  } finally {
    // 僅清理由 mkdtemp 建立的此次測試目錄。
    assert.equal(path.dirname(fixture), os.tmpdir());
    assert.ok(path.basename(fixture).startsWith("lanlan-assets-"));
    await rm(fixture, { recursive: true, force: true });
  }
});
