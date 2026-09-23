import test from "node:test";
import assert from "node:assert/strict";
import { createAdminAccess } from "../src/features/orders/admin-access.js";
import { backend } from "./helpers/apps-script.mjs";

const session = (token = "b".repeat(64)) => ({ token, expiresAt: 10000 });
function fixture(saved = session()) {
  const state = { saved, visible: false, now: 1000, requests: [], invalid: [], timers: new Map() };
  let nextTimer = 0;
  const access = createAdminAccess({
    api(action, payload, token) {
      return new Promise((resolve, reject) => state.requests.push({ action, payload, token, resolve, reject }));
    },
    readSession: () => state.saved,
    clearSession: () => { state.saved = null; },
    onChange: (visible) => { state.visible = visible; },
    onInvalid: (token) => state.invalid.push(token),
    now: () => state.now,
    schedule: (fn) => { state.timers.set(++nextTimer, fn); return nextTimer; },
    cancel: (id) => state.timers.delete(id),
  });
  return { state, access };
}

test("未登入不驗證，保存憑證也須等伺服器確認才顯示管理導覽", async () => {
  const { state, access } = fixture(null);
  await access.sync();
  assert.equal(state.requests.length, 0);
  state.saved = session();
  const task = access.sync();
  assert.equal(state.visible, false);
  assert.equal(state.requests[0].action, "auth.session");
  assert.deepEqual(state.requests[0].payload, {});
  state.requests[0].resolve({ authenticated: true, expiresAt: 9000 });
  await task;
  assert.equal(state.visible, true);
  assert.equal(state.saved.expiresAt, 10000);
  state.now = 9000;
  [...state.timers.values()][0]();
  assert.equal(state.visible, false);
  assert.equal(state.saved, null);
  assert.equal(state.invalid.length, 1);
});

test("跨分頁登出與切換登入後，延遲的成功或失敗不覆蓋較新狀態", async () => {
  const { state, access } = fixture();
  const first = access.sync();
  state.saved = null;
  await access.sync();
  state.requests[0].resolve({ authenticated: true, expiresAt: 10000 });
  await first;
  assert.equal(state.visible, false);
  state.saved = session();
  const old = access.sync();
  state.saved = session("c".repeat(64));
  const latest = access.sync();
  state.requests[2].resolve({ authenticated: true, expiresAt: 10000 });
  await latest;
  state.requests[1].reject({ code: "AUTH" });
  await old;
  assert.equal(state.visible, true);
  assert.equal(state.saved.token, "c".repeat(64));
  assert.equal(state.invalid.length, 0);
  const refresh = access.refresh();
  access.clear();
  state.requests[3].resolve({ authenticated: true, expiresAt: 10000 });
  await refresh;
  assert.equal(state.visible, false);
});

test("網路失敗隱藏入口但保留登入供重試；明確失效才清除，重複檢查共用請求", async () => {
  const { state, access } = fixture();
  const first = access.sync();
  const duplicate = access.refresh();
  assert.equal(state.requests.length, 1);
  state.requests[0].reject({ code: "NETWORK" });
  await Promise.all([first, duplicate]);
  assert.equal(state.visible, false);
  assert.ok(state.saved);
  const retry = access.refresh();
  state.requests[1].resolve({ authenticated: true, expiresAt: 10000 });
  await retry;
  assert.equal(state.visible, true);
  const invalid = access.refresh();
  state.requests[2].reject({ code: "FORBIDDEN" });
  await invalid;
  assert.equal(state.visible, false);
  assert.equal(state.saved, null);
});

test("格式錯誤不顯示，已驗證的本頁登入不依賴 localStorage 且不能延長期限", async () => {
  const { state, access } = fixture();
  const pending = access.sync();
  state.requests[0].resolve({ authenticated: true, expiresAt: "10000" });
  await pending;
  assert.equal(state.visible, false);
  state.saved = null;
  access.confirm({ ...session(), expiresAt: 5000 });
  assert.equal(state.visible, true);
  access.confirm({ ...session(), expiresAt: 10000 });
  state.now = 5000;
  [...state.timers.values()][0]();
  assert.equal(state.visible, false);
  assert.equal(state.invalid.length, 1);
});

test("身分檢查沿用到期與白名單驗證，不讀訂單、不回傳身分或續期", () => {
  const app = backend();
  const token = app.session();
  app.context.SpreadsheetApp.openById = () => { throw new Error("此操作不應讀取訂單"); };
  assert.equal(app.invoke("auth.session").error.code, "AUTH");
  assert.equal(app.invoke("auth.session", {}, "a".repeat(64)).error.code, "AUTH");
  const before = JSON.stringify([...app.cache]);
  const result = app.invoke("auth.session", {}, token);
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.data), ["authenticated", "expiresAt"]);
  assert.equal(result.data.authenticated, true);
  assert.equal(JSON.stringify([...app.cache]), before);
  assert.equal(app.calls.length, 0);
  app.properties.set("ADMIN_TELEGRAM_IDS", "123456");
  assert.equal(app.invoke("auth.session", {}, token).error.code, "AUTH");
  assert.equal(app.cache.has("session:" + app.context.digest_(token)), false);
});
