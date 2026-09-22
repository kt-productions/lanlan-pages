import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { isBridgePeer } from "../src/features/orders/bridge.js";
import { backend } from "./helpers/apps-script.mjs";

test("通訊回應須同時來自指定 iframe、Google 網域與原連線識別", () => {
  const frame = {};
  const peer = { parent: frame };
  const event = { origin: "https://n-fixture-script.googleusercontent.com", source: peer, data: { channel: "fixture" } };
  assert.equal(isBridgePeer(event, frame, "fixture"), true);
  assert.equal(isBridgePeer({ ...event, source: { parent: peer } }, frame, "fixture"), true);
  assert.equal(isBridgePeer({ ...event, source: { parent: { parent: peer } } }, frame, "fixture"), false);
  assert.equal(isBridgePeer({ ...event, origin: "https://attacker.example" }, frame, "fixture"), false);
  assert.equal(isBridgePeer({ ...event, origin: "https://n-fixture-script.googleusercontent.com.attacker.example" }, frame, "fixture"), false);
  assert.equal(isBridgePeer({ ...event, source: { parent: {} } }, frame, "fixture"), false);
  assert.equal(isBridgePeer(event, frame, "wrong-channel"), false);
});

test("GAS 通訊頁僅接受設定的網站上層視窗，不轉送其他來源或錯誤識別的請求", () => {
  const app = backend();
  app.context.HtmlService = {
    XFrameOptionsMode: { ALLOWALL: "bridge-only" },
    createHtmlOutput: value => ({ value, setXFrameOptionsMode() { return this; } }),
  };
  const channel = "a".repeat(64);
  const output = app.context.bridgePage_(channel).value;
  const calls = [];
  const top = { postMessage: (...args) => calls.push({ reply: args }) };
  let receive;
  const runner = {
    withSuccessHandler() { return this; },
    withFailureHandler() { return this; },
    callApi: request => calls.push({ request }),
  };
  vm.runInNewContext(output.match(/<script>([\s\S]*)<\/script>/)[1], {
    window: { top, addEventListener: (_, handler) => { receive = handler; } },
    google: { script: { run: runner } },
  });
  assert.equal(calls[0].reply[1], "https://example.com");
  const message = { type: "lanlan:request", channel, id: "12345678-1234-1234-1234-123456789abc", request: '{"action":"progress.list"}' };
  for (const event of [
    { source: {}, origin: "https://example.com", data: message },
    { source: top, origin: "https://attacker.example", data: message },
    { source: top, origin: "https://example.com", data: { ...message, channel: "wrong" } },
  ]) receive(event);
  assert.equal(calls.length, 1);
  receive({ source: top, origin: "https://example.com", data: message });
  assert.equal(calls[1].request, message.request);
  assert.throws(() => app.context.bridgePage_('"</script>'));
});
