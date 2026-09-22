import test from "node:test";
import assert from "node:assert/strict";
import { readCommission } from "../scripts/lib/content.mjs";
import {
  referenceError,
  contactError,
} from "../src/features/commission/validation.js";

const config = await readCommission();
test("三類參考檔的空檔、大小邊界及 MIME 限制", () => {
  for (const service of Object.values(config.services)) {
    const bytes = service.referenceLimitMB * 1024 * 1024;
    assert.ok(referenceError(service, undefined));
    assert.ok(referenceError(service, { size: 0, type: "image/png" }));
    assert.equal(
      referenceError(service, { size: bytes, type: "image/png" }),
      "",
    );
    assert.ok(referenceError(service, { size: bytes + 1, type: "image/png" }));
  }
  const zip = { size: 1, type: "application/zip" };
  assert.ok(referenceError(config.services.stickers, zip));
  assert.equal(referenceError(config.services.animation, zip), "");
  assert.equal(referenceError(config.services.chibi, zip), "");
});

test("Facebook 只接受 HTTPS 及原定網域，不接受偽裝尾碼", () => {
  for (const value of [
    "https://www.facebook.com/example",
    "https://m.facebook.com/example",
    "https://fb.me/example",
  ]) {
    assert.equal(contactError("facebook", value), "");
  }
  for (const value of [
    "",
    "  ",
    "not-a-url",
    "http://facebook.com/example",
    "https://facebook.com.example.org/x",
    "https://facebook.com@evil.example/x",
  ]) {
    assert.ok(contactError("facebook", value), value);
  }
  assert.equal(contactError("telegram", "@test_example"), "");
  assert.equal(contactError("discord", "example_test"), "");
  assert.ok(contactError("discord", "  "));
});
