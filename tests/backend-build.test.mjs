import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";
import { backendSource } from "../scripts/lib/backend-source.mjs";

test("後端打包不依賴具名匯入的單行排版，保留字串與註解", () => {
  const source =
    'import {\n  first,\n  second,\n} from "./values.js";\n' +
    "// export 是模組宣告，不應改動註解。\n" +
    'export const label = "export import";\n' +
    "export function sum() { return first + second; }\n";
  const body = backendSource(source);
  const result = vm.runInNewContext(
    `const first = 2, second = 3;\n${body}\n({ label, value: sum() })`,
  );
  assert.equal(result.label, "export import");
  assert.equal(result.value, 5);
  assert.ok(body.includes("// export 是模組宣告"));
  assert.equal(backendSource(source.replaceAll("\n", "\r\n")).includes("from"), false);
  assert.throws(() => backendSource("export default 1;\n"), /尚未支援/);
  assert.throws(() => backendSource('import value from "./value.js";\n'), /尚未支援/);
});

test("clasp 上傳白名單涵蓋全部 GAS 來源及產生的模組，排除部署外檔案", async () => {
  const rules = (await readFile(new URL("../.claspignore", import.meta.url), "utf8")).split(
    /\r?\n/,
  );
  assert.equal(rules[0], "**/**");
  const expected = new Set([
    ...(await readdir(new URL("../backend/apps-script/", import.meta.url))),
    "Config.gs",
    "Core.gs",
    "Forge.gs",
    "ArtworkCore.gs",
    "ArtworkBase.gs",
  ]);
  const allowed = new Set(
    rules.filter((line) => line.startsWith("!")).map((line) => line.slice(1)),
  );
  assert.deepEqual(allowed, expected);
  for (const file of expected) {
    const output = await readFile(new URL(`../build/apps-script/${file}`, import.meta.url), "utf8");
    if (file.endsWith(".gs")) assert.doesNotThrow(() => new vm.Script(output), file);
    else assert.doesNotThrow(() => JSON.parse(output));
  }
});
