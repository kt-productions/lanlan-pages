import test from "node:test";
import assert from "node:assert/strict";
import { setupSubmission } from "../src/features/commission/submission.js";
import { backend, submission } from "./helpers/apps-script.mjs";

test("Sheets 已寫入但回應失敗時，前端重試保留識別碼且只建立一筆訂單", async () => {
  const service = backend();
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) {
      elements.set(selector, {
        disabled: false,
        hidden: true,
        textContent: "",
        addEventListener(type, listener) {
          this[type] = listener;
        },
        focus() {},
      });
    }
    return elements.get(selector);
  };
  element("#integration-data").textContent = JSON.stringify({
    apiUrl: "https://script.google.com/macros/s/fixture/exec",
  });
  const originals = ["document", "FormData", "fetch"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]);
  const requests = [];
  let displayedError = "";
  try {
    // 以最小 DOM 替身執行真正的送件處理器；API 串到同一份 Apps Script 測試環境。
    globalThis.document = { querySelector: element };
    globalThis.FormData = class {
      get() {
        return "";
      }
    };
    globalThis.fetch = async (_, options) => {
      const request = JSON.parse(options.body);
      requests.push(request);
      const response = service.invoke(request.action, request.payload);
      return { ok: true, json: async () => response };
    };
    const input = element("#nickname");
    const button = element("#commission-submit");
    setupSubmission(
      { querySelectorAll: () => [input, button] },
      {},
      () => submission(),
      (message) => {
        displayedError = message;
      },
      () => {
        displayedError = "";
      },
    );
    service.faults.flush = true;
    await button.click();
    assert.equal(service.rows.length, 2);
    assert.equal(input.disabled, true);
    assert.equal(button.disabled, false);
    assert.ok(displayedError);
    service.faults.flush = false;
    await button.click();
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1].payload, requests[0].payload);
    assert.equal(service.rows.length, 2);
    assert.equal(button.textContent, "已收件");
    assert.equal(button.disabled, true);
    assert.equal(displayedError, "");
    assert.equal(element("#progress-link").href, "./progress.html");
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
