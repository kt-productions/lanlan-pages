import test from "node:test";
import assert from "node:assert/strict";
import { readCommission } from "../scripts/lib/content.mjs";
import { createDraft } from "../src/features/commission/draft.js";

const config = await readCommission();
const reference = { name: "虛構測試設定.zip", size: 128, type: "" };
function input() {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    nickname: "  測試委託者  ",
    contactChannel: "discord",
    contact: "  example_test  ",
    chibiPlan: "animated",
    characterCount: "2",
    transition: "yes",
    commercial: "yes",
    background: "no",
    rush: "yes",
    payment: "paypal",
    allowLivestream: "no",
    allowPortfolio: "yes",
    notes: "  <測試文字>  ",
  }))
    data.set(key, value);
  for (const number of [1, 1, 49, 50])
    data.append("stickerIds", String(number));
  return data;
}

test("第 4 版草稿保留五個參考檔的中繼資料，下載不會變成已送件或已確認", () => {
  const result = createDraft(config, "animation", input(), Array(5).fill(reference), true);
  assert.deepEqual(Object.keys(result), [
    "schemaVersion",
    "mode",
    "submitted",
    "service",
    "sourceForm",
    "nickname",
    "contact",
    "referenceUrl",
    "references",
    "stickerIds",
    "chibiPlan",
    "characterCount",
    "transition",
    "commercial",
    "background",
    "rush",
    "payment",
    "allowLivestream",
    "allowPortfolio",
    "notes",
    "rulesReviewed",
    "priceConfirmed",
    "estimatedPrice",
  ]);
  assert.equal(result.schemaVersion, 4);
  assert.equal(result.referenceUrl, "");
  assert.equal(result.mode, "local-preview");
  assert.equal(result.nickname, "測試委託者");
  assert.deepEqual(result.contact, {
    channel: "discord",
    value: "example_test",
  });
  assert.deepEqual(result.references, Array(5).fill({
    ...reference,
    type: "application/octet-stream",
    uploaded: false,
  }));
  assert.deepEqual(
    [result.submitted, result.priceConfirmed, result.estimatedPrice.confirmed],
    [false, false, false],
  );
  assert.deepEqual(
    [result.estimatedPrice.min, result.estimatedPrice.max],
    [10500, 15225],
  );
  assert.equal(result.notes, "<測試文字>");
  assert.equal(result.rulesReviewed, true);
});

test("第 4 版可只提供素材連結，沒有本機檔案時記錄空陣列", () => {
  const data = input();
  data.set("referenceUrl", " https://example.com/reference ");
  const result = createDraft(config, "animation", data, undefined, true);
  assert.deepEqual(result.references, []);
  assert.equal(result.referenceUrl, "https://example.com/reference");
  assert.equal(result.submitted, false);
});

test("跨類型殘留選項不進入草稿；貼圖去重並排除未開放款式", () => {
  const stickers = createDraft(config, "stickers", input(), [reference], true);
  assert.deepEqual(stickers.stickerIds, [1]);
  for (const key of [
    "chibiPlan",
    "characterCount",
    "transition",
    "background",
    "rush",
  ])
    assert.equal(stickers[key], null, key);
  assert.equal(stickers.allowLivestream, false);
  const chibi = createDraft(config, "chibi", input(), [reference], true);
  assert.deepEqual(chibi.stickerIds, []);
  for (const key of [
    "transition",
    "commercial",
    "background",
    "allowLivestream",
    "notes",
  ])
    assert.equal(chibi[key], null, key);
  assert.equal(chibi.allowPortfolio, true);
  assert.deepEqual(
    [chibi.estimatedPrice.min, chibi.estimatedPrice.max],
    [2520, 2940],
  );
});

test("返回修改後的新草稿更新內容，原確認快照保持獨立", () => {
  const data = input();
  const before = createDraft(config, "animation", data, [reference], true);
  data.set("nickname", "修改後的測試者");
  data.set("characterCount", "1");
  const after = createDraft(config, "animation", data, [reference], true);
  assert.equal(before.nickname, "測試委託者");
  assert.equal(before.characterCount, 2);
  assert.equal(after.nickname, "修改後的測試者");
  assert.equal(after.characterCount, 1);
  assert.notDeepEqual(before.estimatedPrice, after.estimatedPrice);
});
