import test from "node:test";
import assert from "node:assert/strict";
import { createLoginPopup } from "../src/features/orders/login-popup.js";
import { backend, jwt } from "./helpers/apps-script.mjs";

const browserKey = "a".repeat(64);
const ticket = "b".repeat(64);
const authUrl = "https://oauth.telegram.org/auth?client_id=fixture";

function startBackend(app, popup = true) {
  const result = app.invoke("auth.start", { browserKey, popup });
  assert.equal(result.ok, true);
  const url = new URL(result.data.url);
  app.faults.token = jwt({ nonce: url.searchParams.get("nonce") });
  return { state: url.searchParams.get("state"), code: "fixture-code" };
}

test("彈出視窗登入只讓原 browserKey 取得票證，交換後沿用既有管理權限", () => {
  const app = backend();
  const writes = app.writes.length;
  const params = startBackend(app);
  assert.deepEqual(app.invoke("auth.poll", { browserKey }).data, { pending: true });
  for (const value of [params.state, "c".repeat(64), "invalid"]) {
    assert.equal(app.invoke("auth.poll", { browserKey: value }).error.code, "AUTH");
  }
  const html = app.context.doGet({ parameter: params });
  assert.match(html, /window\.top\.close/);
  assert.match(html, /原管理頁會自動完成登入/);
  const result = app.invoke("auth.poll", { browserKey }).data;
  assert.deepEqual(Object.keys(result), ["ticket"]);
  assert.match(result.ticket, /^[a-f0-9]{64}$/);
  assert.equal(
    app.invoke("auth.exchange", { ...result, browserKey: "c".repeat(64) }).error.code,
    "AUTH",
  );
  const session = app.invoke("auth.exchange", { ...result, browserKey });
  assert.equal(session.ok, true);
  assert.equal(app.invoke("admin.list", {}, session.data.token).ok, true);
  assert.deepEqual(app.invoke("auth.exchange", { ...result, browserKey }).data, session.data);
  assert.equal(app.writes.length, writes);
  assert.equal(
    app.calls.some(({ url }) => /api\.telegram\.org/.test(url)),
    false,
  );
});

test("拒絕、取消及逾時會回報原管理頁，不能拿到登入票證", () => {
  for (const scenario of ["cancel", "forbidden", "nonce"]) {
    const app = backend();
    const params = startBackend(app);
    if (scenario === "cancel") params.error = "access_denied";
    if (scenario === "forbidden") {
      const pending = JSON.parse(app.cache.get("oauth:" + app.context.digest_(params.state)).value);
      app.faults.token = jwt({ nonce: pending.nonce, id: 123456 });
    }
    if (scenario === "nonce") app.faults.token = jwt({ nonce: "wrong-nonce" });
    const html = app.context.doGet({ parameter: params });
    assert.match(html, /無法登入/);
    assert.doesNotMatch(html, /window\.top\.close/);
    const result = app.invoke("auth.poll", { browserKey });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, scenario === "forbidden" ? "FORBIDDEN" : "AUTH");
    assert.equal(
      [...app.cache.keys()].some((key) => key.startsWith("ticket:")),
      false,
    );
  }
  const app = backend();
  startBackend(app);
  app.cache.get("login:" + app.context.digest_(browserKey)).until = Date.now() - 1;
  assert.equal(app.invoke("auth.poll", { browserKey }).error.code, "AUTH");
});

test("結果和票證維持兩分鐘期限；舊請求不能覆蓋新的登入", () => {
  const app = backend();
  const old = startBackend(app);
  const oldToken = app.faults.token;
  const current = startBackend(app);
  const currentToken = app.faults.token;
  app.faults.token = oldToken;
  app.context.doGet({ parameter: old });
  assert.deepEqual(app.invoke("auth.poll", { browserKey }).data, { pending: true });
  app.faults.token = currentToken;
  app.context.doGet({ parameter: current });
  const result = app.invoke("auth.poll", { browserKey }).data;
  for (const key of [
    "login:" + app.context.digest_(browserKey),
    "ticket:" + app.context.digest_(result.ticket),
  ]) {
    const saved = app.cache.get(key);
    assert.ok(saved.until - Date.now() <= 120000);
    saved.until = Date.now() - 1;
  }
  assert.equal(app.invoke("auth.poll", { browserKey }).error.code, "AUTH");
  assert.equal(app.invoke("auth.exchange", { ...result, browserKey }).error.code, "AUTH");
});

test("未使用彈出視窗時保留原手動回程，不建立可輪詢結果", () => {
  const app = backend();
  assert.equal(app.invoke("auth.start", { browserKey, popup: "true" }).error.code, "AUTH");
  const params = startBackend(app, false);
  const html = app.context.doGet({ parameter: params });
  assert.match(html, /返回管理後台/);
  assert.doesNotMatch(html, /window\.top\.close/);
  assert.equal(app.invoke("auth.poll", { browserKey }).error.code, "AUTH");
});

function harness({ blocked = false, respond = async () => ({ pending: true }) } = {}) {
  const events = [];
  const timers = new Map();
  let nextTimer = 0;
  const popup = {
    opener: {},
    close: () => events.push("close"),
    location: { replace: (url) => events.push(["navigate", url]) },
  };
  const host = {
    open() {
      events.push("open");
      return blocked ? null : popup;
    },
    location: { assign: (url) => events.push(["fallback", url]) },
    setTimeout(fn) {
      timers.set(++nextTimer, fn);
      return nextTimer;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  const api = async (action, payload) => {
    events.push([action, payload]);
    return action === "auth.start" ? { url: authUrl } : respond();
  };
  const callbacks = {
    onWaiting: () => events.push("waiting"),
    onTicket: (value) => events.push(["ticket", value]),
    onError: (error) => events.push(["error", error.code]),
  };
  const login = createLoginPopup(api, { host, ...callbacks });
  async function tick() {
    const entry = timers.entries().next().value;
    assert.ok(entry, "應排定下一次查詢");
    timers.delete(entry[0]);
    await entry[1]();
  }
  return { login, api, host, callbacks, events, popup, timers, tick };
}

test("同步開啟視窗，驗證成功後只交換一次票證並結束輪詢", async () => {
  let calls = 0;
  const qa = harness({ respond: async () => (++calls === 1 ? { pending: true } : { ticket }) });
  await qa.login.start(browserKey);
  assert.equal(qa.events[0], "open");
  assert.equal(qa.events[1][0], "auth.start");
  assert.equal(qa.events[1][1].popup, true);
  assert.equal(qa.popup.opener, null);
  await qa.tick();
  assert.equal(qa.login.active(), true);
  await qa.tick();
  assert.equal(qa.login.active(), false);
  assert.equal(qa.timers.size, 0);
  assert.deepEqual(
    qa.events.filter((event) => event[0] === "ticket"),
    [["ticket", { ticket, browserKey }]],
  );
  assert.equal(qa.events.filter((event) => event === "close").length, 1);
});

test("取消時清除輪詢，忽略已在傳輸中的成功結果", async () => {
  let resolve;
  const qa = harness({
    respond: () =>
      new Promise((done) => {
        resolve = done;
      }),
  });
  await qa.login.start(browserKey);
  const pending = qa.tick();
  qa.login.cancel();
  resolve({ ticket });
  await pending;
  assert.equal(qa.login.active(), false);
  assert.equal(qa.timers.size, 0);
  assert.equal(
    qa.events.some((event) => event[0] === "ticket"),
    false,
  );
});

test("短暫網路失敗可恢復，連續失敗或驗證拒絕會停止並回報", async () => {
  for (const code of ["NETWORK", "FORBIDDEN", "AUTH"]) {
    const qa = harness({
      respond: async () => {
        throw Object.assign(new Error("模擬錯誤"), { code });
      },
    });
    await qa.login.start(browserKey);
    const attempts = code === "NETWORK" ? 3 : 1;
    for (let index = 0; index < attempts; index++) await qa.tick();
    assert.equal(qa.timers.size, 0);
    assert.equal(qa.login.active(), false);
    assert.deepEqual(
      qa.events.filter((event) => event[0] === "error"),
      [["error", code]],
    );
  }
  let calls = 0;
  const qa = harness({
    respond: async () => {
      if (++calls === 1) throw Object.assign(new Error("短暫斷線"), { code: "NETWORK" });
      return { ticket };
    },
  });
  await qa.login.start(browserKey);
  await qa.tick();
  await qa.tick();
  assert.equal(
    qa.events.some((event) => event[0] === "error"),
    false,
  );
  assert.equal(
    qa.events.some((event) => event[0] === "ticket"),
    true,
  );
});

test("瀏覽器阻擋視窗時退回原分頁登入，且不啟動輪詢", async () => {
  const qa = harness({ blocked: true });
  await qa.login.start(browserKey);
  assert.equal(qa.events[1][1].popup, false);
  assert.deepEqual(qa.events.at(-1), ["fallback", authUrl]);
  assert.equal(qa.timers.size, 0);
  assert.equal(qa.login.active(), false);
});

test("錯誤登入網址會關閉空白視窗；跨來源關閉受阻仍可完成票證交換", async () => {
  const qa = harness({ respond: async () => ({ ticket }) });
  const invalid = createLoginPopup(async () => ({ url: "https://example.com/" }), {
    host: qa.host,
    ...qa.callbacks,
  });
  await assert.rejects(() => invalid.start(browserKey), /登入網址不正確/);
  assert.equal(invalid.active(), false);
  assert.equal(qa.events.at(-1), "close");
  qa.popup.close = () => {
    throw new Error("模擬跨來源視窗拒絕關閉");
  };
  await qa.login.start(browserKey);
  await qa.tick();
  assert.equal(
    qa.events.some((event) => event[0] === "ticket"),
    true,
  );
});
