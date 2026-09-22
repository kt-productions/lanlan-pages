import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { prepareStickerOptions, readContent } from "../scripts/lib/content.mjs";
import {
  escapeHtml,
  inlineJson,
  renderTemplate,
} from "../scripts/lib/templates.mjs";
import { resolveWithin, output } from "../scripts/lib/paths.mjs";

test("款式來源保留附註、排除未確認款式，無法解析時停止建置", async () => {
  const options = await readContent("forms/sticker-options.json");
  const prepared = prepareStickerOptions(options);
  assert.equal(prepared.length, 48);
  assert.deepEqual(
    prepareStickerOptions([
      ...options,
      { number: 999, label: "測試用未確認款式", needsReview: true },
    ]),
    prepared,
  );
  assert.equal(prepared.find((item) => item.number === 33).price, 200);
  assert.equal(prepared.find((item) => item.number === 48).price, 150);
  assert.throws(() =>
    prepareStickerOptions([{ ...options[0], label: "缺少價格" }]),
  );
  assert.throws(() => prepareStickerOptions([options[0], options[0]]));
});

test("共用模板保留 HTML 與內嵌 JSON 跳脫，不遞迴解析資料中的模板文字", () => {
  const value = '</script><img src=x onerror="alert(1)">&\'';
  assert.equal(
    escapeHtml(value),
    "&lt;/script&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;",
  );
  assert.ok(!inlineJson({ value }).includes("<"));
  assert.equal(JSON.parse(inlineJson({ value })).value, value);
  assert.equal(renderTemplate("{{TITLE}}", { TITLE: "{{DATA}}" }), "{{DATA}}");
  assert.throws(() => renderTemplate("{{UNKNOWN}}", {}));
});

test("搬移後模組可回到共用資料夾，但不得跳出產物或進入同名前綴資料夾", () => {
  assert.equal(
    resolveWithin(output, "assets/site/pages/home/../../shared/navigation.js"),
    path.join(output, "assets/site/shared/navigation.js"),
  );
  assert.throws(() => resolveWithin(output, "../dist-other/private.json"));
  assert.throws(() => resolveWithin(output, "../../private.json"));
});
