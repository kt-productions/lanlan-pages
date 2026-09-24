import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createAdminSession } from "../src/features/orders/admin-session.js";
import { backend } from "./helpers/apps-script.mjs";

const lifetime = 3 * 24 * 60 * 60 * 1000;
const token = "b".repeat(64);

function memoryStorage() {
  const data = new Map();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

function issueSession(app) {
  const ticket = "a".repeat(64);
  const browserKey = "c".repeat(64);
  app.context.CacheService.getScriptCache().put(
    "ticket:" + app.context.digest_(ticket),
    JSON.stringify({
      id: "987654",
      browserHash: app.context.digest_(browserKey),
      expiresAt: Date.now() + 120000,
    }),
    120,
  );
  return app.invoke("auth.exchange", { ticket, browserKey }).data;
}

test("重新開頁仍可還原登入，期限固定且不保存訂單或身分資料", () => {
  const storage = memoryStorage();
  let now = Date.now();
  const original = { token, expiresAt: now + lifetime, id: "987654", orders: ["私人資料"] };
  const first = createAdminSession(
    "https://example.com/api",
    () => storage,
    () => now,
  );
  assert.equal(first.save(original), true);
  const reopened = createAdminSession(
    "https://example.com/api",
    () => storage,
    () => now,
  );
  now += lifetime - 1;
  assert.deepEqual(reopened.read(), { version: 1, token, expiresAt: original.expiresAt });
  assert.equal(
    createAdminSession(
      "https://example.com/another",
      () => storage,
      () => now,
    ).read(),
    null,
  );
  now += 1;
  assert.equal(reopened.read(), null);
  assert.equal(storage.getItem(first.key), null);
});

test("登出清除保存，格式損壞與不支援版本皆不能還原登入", () => {
  const storage = memoryStorage();
  const session = createAdminSession("fixture", () => storage);
  session.save({ token, expiresAt: Date.now() + lifetime });
  session.clear();
  assert.equal(session.read(), null);
  for (const value of [
    "{",
    "null",
    JSON.stringify({ version: 2, token, expiresAt: Date.now() + lifetime }),
    JSON.stringify({ version: 1, token: "wrong", expiresAt: Date.now() + lifetime }),
    JSON.stringify({ version: 1, token, expiresAt: String(Date.now() + lifetime) }),
  ]) {
    storage.setItem(session.key, value);
    assert.equal(session.read(), null);
    assert.equal(storage.getItem(session.key), null);
  }
});

test("瀏覽器封鎖儲存時回報無法持久保存，但不拋錯阻斷登入介面", () => {
  const session = createAdminSession("fixture", () => {
    throw new Error("SecurityError");
  });
  assert.equal(session.read(), null);
  assert.equal(session.save({ token, expiresAt: Date.now() + lifetime }), false);
  assert.equal(session.clear(), false);
});

test("後端核發固定 72 小時工作階段，快取全數遺失仍有效，到期立即拒絕", () => {
  const app = backend();
  const before = Date.now();
  const session = issueSession(app);
  assert.ok(session.expiresAt >= before + lifetime && session.expiresAt <= Date.now() + lifetime);
  const key = "session:" + app.context.digest_(session.token);
  const saved = JSON.parse(app.properties.get(key));
  assert.deepEqual(saved, { id: "987654", expiresAt: session.expiresAt });
  assert.equal(app.cache.has(key), false);
  app.cache.clear();
  app.context.fixtureNow = session.expiresAt - 1;
  vm.runInContext("Date.now = () => fixtureNow", app.context);
  assert.equal(app.invoke("admin.list", {}, session.token).ok, true);
  assert.equal(JSON.parse(app.properties.get(key)).expiresAt, session.expiresAt);
  app.context.fixtureNow = session.expiresAt;
  assert.equal(app.invoke("admin.list", {}, session.token).error.code, "AUTH");
  assert.equal(app.properties.has(key), false);
});

test("登出與撤除白名單皆撤銷持久工作階段，恢復白名單也不復活", () => {
  for (const action of ["logout", "remove-admin"]) {
    const app = backend();
    const session = issueSession(app);
    const key = "session:" + app.context.digest_(session.token);
    if (action === "logout") assert.equal(app.invoke("auth.logout", {}, session.token).ok, true);
    else app.properties.set("ADMIN_TELEGRAM_IDS", "123456");
    assert.equal(app.invoke("admin.list", {}, session.token).error.code, "AUTH");
    assert.equal(app.properties.has(key), false);
    app.properties.set("ADMIN_TELEGRAM_IDS", "987654");
    assert.equal(app.invoke("admin.list", {}, session.token).error.code, "AUTH");
  }
});

test("新登入只清理過期或損壞工作階段，保留其他有效登入與服務設定", () => {
  const app = backend();
  const secret = app.properties.get("SESSION_SECRET");
  app.properties.set("session:expired", JSON.stringify({ expiresAt: Date.now() - 1 }));
  app.properties.set("session:broken", "{");
  app.properties.set("session:null", "null");
  const valid = JSON.stringify({ id: "987654", expiresAt: Date.now() + lifetime });
  app.properties.set("session:valid", valid);
  issueSession(app);
  assert.equal(app.properties.has("session:expired"), false);
  assert.equal(app.properties.has("session:broken"), false);
  assert.equal(app.properties.has("session:null"), false);
  assert.equal(app.properties.get("session:valid"), valid);
  assert.equal(app.properties.get("SESSION_SECRET"), secret);
});

test("部署前的快取工作階段沿用原期限，登出仍可撤銷", () => {
  const app = backend();
  const legacy = app.session();
  assert.equal(app.invoke("admin.list", {}, legacy).ok, true);
  assert.equal(app.properties.has("session:" + app.context.digest_(legacy)), false);
  assert.equal(app.invoke("auth.logout", {}, legacy).ok, true);
  assert.equal(app.invoke("admin.list", {}, legacy).error.code, "AUTH");
});
