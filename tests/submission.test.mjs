import test from "node:test";
import assert from "node:assert/strict";
import { setupSubmission } from "../src/features/commission/submission.js";
import { backend, submission } from "./helpers/apps-script.mjs";

test("前端逐檔上傳，第二檔回應中斷後從該檔續傳，不要求素材連結且不重複建檔", async () => {
  const service = backend();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7WQAAAAASUVORK5CYII=", "base64");
  const files = Array.from({ length: 5 }, (_, index) => new File([png], `測試-${index}.png`, { type: "image/png" }));
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, { disabled: false, hidden: true, textContent: "", files: [],
      addEventListener(type, listener) { this[type] = listener; }, focus() {} });
    return elements.get(selector);
  };
  element("#integration-data").textContent = JSON.stringify({ apiUrl: "https://script.google.com/macros/s/fixture/exec" });
  element("#commission-reference").files = files;
  const originals = ["document", "FormData", "fetch", "FileReader"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const calls = [];
  let interrupt = true;
  try {
    globalThis.document = { querySelector: element };
    globalThis.FormData = class { get() { return ""; } };
    globalThis.FileReader = class {
      async readAsDataURL(file) {
        this.result = "data:" + file.type + ";base64," + Buffer.from(await file.arrayBuffer()).toString("base64");
        this.onload();
      }
    };
    globalThis.fetch = async (_, options) => {
      const request = JSON.parse(options.body);
      calls.push(request);
      const result = service.invoke(request.action, request.payload);
      if (request.action === "orders.upload" && request.payload.index === 1 && interrupt) {
        interrupt = false;
        throw new Error("模擬上傳成功後回應中斷");
      }
      return { ok: true, json: async () => result };
    };
    const button = element("#commission-submit");
    const input = element("#nickname");
    setupSubmission({ querySelectorAll: () => [input, button] }, {}, () => submission({ referenceUrl: "" }), () => {}, () => {});
    await button.click();
    assert.equal(input.disabled, true);
    assert.equal(service.rows.length, 1);
    assert.equal(service.files.size, 3);
    await button.click();
    assert.equal(button.textContent, "已收件");
    assert.deepEqual(calls.filter((call) => call.action === "orders.upload").map((call) => call.payload.index), [0, 1, 1, 2, 3, 4]);
    assert.equal(new Set(calls.map((call) => call.payload.requestId)).size, 1);
    assert.equal(service.files.size, 6);
    assert.equal(service.rows.length, 2);
    assert.equal(element("#commission-reference-url").required, false);
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test("Sheets 已寫入但回應失敗時，前端重試保留識別碼且只建立一筆訂單", async () => {
  const service = backend();
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) {
      elements.set(selector, {
        disabled: false,
        hidden: true,
        textContent: "",
        files: [],
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
    assert.equal(element("#progress-link").href, "../progress/");
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
