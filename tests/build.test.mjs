import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
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

test("舊頁面轉址保留子路徑、查詢參數與登入票證，不能被 query 改成站外目標", async () => {
  const template = await readFile(
    new URL("../src/templates/redirect.html", import.meta.url),
    "utf8",
  );
  for (const prefix of ["/", "/lanlan-pages/"]) {
    for (const page of ["commission", "progress", "admin"]) {
      const location = new URL(
        `https://example.com${prefix}${page}.html?next=https%3A%2F%2Fother.example#ticket=fixture`,
      );
      let destination;
      location.replace = (value) => {
        destination = new URL(value, location);
      };
      const html = renderTemplate(template, {
        PAGE: page,
        TITLE: "測試頁面",
        PAGE_URL: `https://example.com${prefix}${page}/`,
      });
      vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
        URL,
        location,
      });
      assert.equal(destination.origin, location.origin);
      assert.equal(destination.pathname, `${prefix}${page}/`);
      assert.equal(destination.search, location.search);
      assert.equal(destination.hash, location.hash);
    }
  }
});

test("直接開啟 index.html 會回到目錄首頁，目錄網址本身不重複轉址", async () => {
  const head = await readFile(
    new URL("../src/templates/head.html", import.meta.url),
    "utf8",
  );
  const script = head.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const prefix of ["/", "/lanlan-pages/", "/lanlan-pages/commission/"]) {
    let destination;
    const location = new URL(
      `https://example.com${prefix}index.html?source=bookmark#main`,
    );
    location.replace = (value) => {
      destination = new URL(value, location);
    };
    vm.runInNewContext(script, { location });
    assert.equal(destination.pathname, prefix);
    assert.equal(destination.search, location.search);
    assert.equal(destination.hash, location.hash);
    vm.runInNewContext(script, {
      location: { pathname: prefix, replace: () => assert.fail("不應重複轉址") },
    });
  }
});
