import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  validateSubmission,
  publicOrder,
  validateUpdate,
  ORDER_STATUSES,
  orderWorkflow,
} from "../src/features/orders/contract.js";
import { createApi } from "../src/features/orders/api.js";
import { backend, config, submission, jwt } from "./helpers/apps-script.mjs";

test("初始化入口拒絕匿名及不同執行者，重跑保留訂單且表頭不符時停止", () => {
  const app = backend();
  app.invoke("orders.submit", {
    requestId: randomUUID(),
    details: submission(),
  });
  const existingRows = JSON.stringify(app.rows);
  const existingWrites = app.writes.length;
  app.context.setupOrders();
  assert.equal(JSON.stringify(app.rows), existingRows);
  assert.equal(app.writes.length, existingWrites);

  for (const activeEmail of ["", "someone-else@example.com"]) {
    app.context.Session.getActiveUser = () => ({ getEmail: () => activeEmail });
    assert.throws(() => app.context.setupOrders(), { code: "FORBIDDEN" });
    assert.equal(app.writes.length, existingWrites);
  }

  app.context.Session.getActiveUser = () => ({
    getEmail: () => "owner@example.com",
  });
  app.rows[0][0] = "unexpectedHeader";
  assert.throws(() => app.context.setupOrders(), { code: "CONFIG" });
  assert.equal(app.rows[0][0], "unexpectedHeader");
  assert.equal(app.writes.length, existingWrites);
});

test("收件忽略前端報價及權限欄位，三類型沿用同一套伺服器計價", () => {
  const animation = validateSubmission(
    submission({
      estimatedPrice: { min: 1 },
      priceConfirmed: true,
      admin: true,
    }),
    config,
  );
  assert.equal(animation.estimatedPrice.min, 4500);
  assert.equal(animation.priceConfirmed, false);
  assert.equal(animation.admin, undefined);
  const stickers = validateSubmission(
    submission({
      service: "stickers",
      stickerIds: [35, 34, 33],
      commercial: true,
    }),
    config,
  );
  assert.deepEqual(stickers.stickerIds, [33, 34, 35]);
  assert.equal(stickers.characterCount, null);
  const chibi = validateSubmission(
    submission({ service: "chibi", chibiPlan: "animated", characterCount: 2 }),
    config,
  );
  assert.equal(chibi.commercial, null);
  // 插圖＋動畫 1,200，加第二角色 50%；此案例沒有急件費。
  assert.equal(chibi.estimatedPrice.min, 1800);
});

test("後端拒絕未選授權、舊版、危險連結、超長與未知款式", () => {
  for (const change of [
    { allowPortfolio: null },
    { schemaVersion: 2 },
    { nickname: "x".repeat(81) },
    { referenceUrl: "javascript:alert(1)" },
    { referenceUrl: "https://user:password@example.com/" },
    { service: "stickers", stickerIds: [49] },
    { service: "stickers", stickerIds: [1, 1] },
    { characterCount: "2" },
    { transition: "false" },
    { rulesReviewed: false },
  ])
    assert.throws(() => validateSubmission(submission(change), config), {
      code: change.schemaVersion ? "VERSION" : "VALIDATION",
    });
});

test("公開投影不含聯絡資訊、參考素材、內部備註與通知資料", () => {
  const projected = publicOrder({
    orderId: "LL-test",
    service: "animation",
    status: "working",
    progress: 50,
    publicNote: "草圖處理中",
    updatedAt: "2026-09-22T00:00:00Z",
    nickname: "公開測試暱稱",
    contactValue: "private",
    referenceUrl: "private",
    detailsJson: '{"nickname":"private"}',
    adminNote: "private",
    notificationError: "private",
  });
  assert.deepEqual(Object.keys(projected), [
    "orderId",
    "service",
    "status",
    "isRush",
    "isOnHold",
    "isArchived",
    "publicNote",
    "updatedAt",
    "displayTitle",
  ]);
  assert.ok(!JSON.stringify(projected).includes("private"));
  assert.equal(projected.displayTitle, "公開測試暱稱");
});

test("成功先寫入 Sheets 再通知；重送同一內容只有一筆訂單與一次通知", () => {
  const app = backend();
  const payload = { requestId: randomUUID(), details: submission() };
  const first = app.invoke("orders.submit", payload);
  assert.equal(first.ok, true);
  assert.match(first.data.orderId, /^LL-[A-F0-9]{16}$/);
  const second = app.invoke("orders.submit", payload);
  assert.deepEqual(second, first);
  assert.equal(app.rows.length, 2);
  assert.equal(
    app.calls.filter((call) => call.url.endsWith("/sendMessage")).length,
    1,
  );
  // 使用者要求通知完整填單內容；聯絡方式只送往既有通知名單。
  assert.ok(app.calls[0].options.payload.includes("fictional_test"));
  payload.details.notes = "不同內容";
  assert.equal(app.invoke("orders.submit", payload).error.code, "CONFLICT");
});

test("通知中斷不丟單、不向客戶洩漏例外，管理員可重試；已通知不重傳", () => {
  const app = backend();
  app.faults.telegram = true;
  const receipt = app.invoke("orders.submit", {
    requestId: randomUUID(),
    details: submission(),
  });
  assert.equal(receipt.ok, true);
  const token = app.session();
  let order = app.invoke("admin.list", {}, token).data.orders[0];
  assert.equal(order.notificationStatus, "unknown");
  app.faults.telegram = false;
  assert.equal(
    app.invoke("admin.retryNotification", { orderId: order.orderId }, token)
      .data.status,
    "sent",
  );
  const count = app.calls.length;
  app.invoke("admin.retryNotification", { orderId: order.orderId }, token);
  assert.equal(app.calls.length, count);
  order = app.invoke("admin.list", {}, token).data.orders[0];
  assert.equal(order.notificationAttempts, 2);
});

test("寫入或鎖失敗不通知；暫停收件仍可取回既有回執", () => {
  const app = backend();
  const payload = { requestId: randomUUID(), details: submission() };
  app.faults.write = true;
  assert.equal(app.invoke("orders.submit", payload).error.code, "SERVER");
  assert.equal(app.calls.length, 0);
  app.faults.write = false;
  app.faults.lock = true;
  assert.equal(app.invoke("orders.submit", payload).error.code, "BUSY");
  app.faults.lock = false;
  const receipt = app.invoke("orders.submit", payload);
  app.properties.set("ACCEPTING_ORDERS", "false");
  assert.deepEqual(app.invoke("orders.submit", payload), receipt);
  assert.equal(
    app.invoke("orders.submit", { ...payload, requestId: randomUUID() }).error
      .code,
    "CLOSED",
  );
});

test("多人通知去除重複 ID，與管理員白名單分開，冪等重送不補發", () => {
  const app = backend();
  app.properties.set("TELEGRAM_NOTIFY_USER_IDS", "111, 222\n111");
  const payload = { requestId: randomUUID(), details: submission() };
  const receipt = app.invoke("orders.submit", payload);
  assert.equal(receipt.ok, true);
  const sentTo = () => app.calls.filter(call => call.url.endsWith("/sendMessage"))
    .map(call => JSON.parse(call.options.payload).chat_id);
  assert.deepEqual(sentTo(), ["111", "222"]);
  assert.equal(app.properties.get("ADMIN_TELEGRAM_IDS"), "987654");
  const states = JSON.parse(app.rows[1][app.rows[0].indexOf("notificationRecipientsJson")]);
  assert.ok(states.every(entry => entry.status === "sent" && entry.attempts === 1));
  assert.deepEqual(app.invoke("orders.submit", payload), receipt);
  app.properties.set("TELEGRAM_NOTIFY_USER_IDS", "333");
  app.invoke("admin.retryNotification", { orderId: receipt.data.orderId }, app.session());
  assert.deepEqual(sentTo(), ["111", "222"]);
  assert.ok(!JSON.stringify(app.invoke("progress.list")).includes("notificationRecipients"));
});

test("部分通知失敗與中斷後只重試未送達者，名單固定且結果逐位保存", () => {
  const app = backend();
  app.properties.set("TELEGRAM_NOTIFY_USER_IDS", "111,222,333");
  app.faults.telegramResult = (id) => {
    if (id === "333") throw new Error("模擬結果不明");
    return {
      getResponseCode: () => id === "222" ? 403 : 200,
      getContentText: () => JSON.stringify({ ok: id !== "222" }),
    };
  };
  const receipt = app.invoke("orders.submit", { requestId: randomUUID(), details: submission() });
  assert.equal(receipt.ok, true);
  const stateColumn = app.rows[0].indexOf("notificationRecipientsJson");
  assert.deepEqual(JSON.parse(app.rows[1][stateColumn]).map(entry => entry.status), ["sent", "failed", "unknown"]);
  assert.ok(app.writes.some(write => {
    const value = write[0][stateColumn];
    return typeof value === "string" && value.startsWith("[") &&
      JSON.parse(value)[0].status === "sent" && JSON.parse(value)[1].status === "pending";
  }));
  const token = app.session();
  assert.equal(app.invoke("admin.list", {}, token).data.orders[0].notificationStatus, "unknown");
  app.properties.set("TELEGRAM_NOTIFY_USER_IDS", "444");
  app.faults.telegramResult = null;
  assert.equal(app.invoke("admin.retryNotification", { orderId: receipt.data.orderId }, token).data.status, "sent");
  assert.deepEqual(app.calls.filter(call => call.url.endsWith("/sendMessage"))
    .map(call => JSON.parse(call.options.payload).chat_id), ["111", "222", "333", "222", "333"]);
  assert.deepEqual(JSON.parse(app.rows[1][stateColumn]).map(entry => entry.attempts), [1, 2, 2]);
  assert.equal(app.rows.length, 2);
});

test("通知設定錯誤不丟單、不送到部分名單，修正後可重試", () => {
  for (const value of ["@someone", "111,-222", "111，222", "0", Array.from({ length: 21 }, (_, i) => String(i + 1)).join(",")]) {
    const app = backend();
    app.properties.set("TELEGRAM_NOTIFY_USER_IDS", value);
    const receipt = app.invoke("orders.submit", { requestId: randomUUID(), details: submission() });
    assert.equal(receipt.ok, true);
    assert.equal(app.calls.length, 0);
    const token = app.session();
    const order = app.invoke("admin.list", {}, token).data.orders[0];
    assert.equal(order.notificationStatus, "failed");
    assert.equal(order.notificationError, "CONFIG");
    app.properties.set("TELEGRAM_NOTIFY_USER_IDS", "111,222");
    assert.equal(app.invoke("admin.retryNotification", { orderId: order.orderId }, token).data.status, "sent");
    assert.equal(app.calls.length, 2);
  }
});

test("尚未發布 GitHub Pages 時仍可收件通知，略過未設定的管理頁連結", () => {
  const app = backend();
  app.properties.delete("ADMIN_URL");
  const receipt = app.invoke("orders.submit", { requestId: randomUUID(), details: submission() });
  assert.equal(receipt.ok, true);
  const message = JSON.parse(app.calls[0].options.payload).text;
  assert.ok(message.includes(receipt.data.orderId));
  assert.ok(!message.includes("管理後台"));
  assert.equal(app.invoke("admin.list", {}, app.session()).data.orders[0].notificationStatus, "sent");
  assert.equal(app.invoke("auth.start", { browserKey: "a".repeat(64) }).error.code, "CONFIG");
});

test("29 欄舊表只追加通知欄，已有尾端資料或公式時停止", () => {
  const app = backend();
  app.invoke("orders.submit", { requestId: randomUUID(), details: submission() });
  app.rows.forEach(row => { row.length = 29; });
  app.faults.maxColumns = 29;
  const before = structuredClone(app.rows);
  app.context.setupOrders();
  assert.deepEqual(app.rows.map(row => row.slice(0, 29)), before);
  assert.equal(app.rows[0][29], "notificationRecipientsJson");
  assert.equal(app.faults.maxColumns, 32);
  const calls = app.calls.length;
  app.invoke("admin.retryNotification", { orderId: app.rows[1][0] }, app.session());
  assert.equal(app.calls.length, calls);
  for (const occupied of ["data", "formula"]) {
    const fixture = backend();
    fixture.rows[0].length = 29;
    if (occupied === "data") fixture.rows.push([...Array(29).fill(""), "保留內容"]);
    else fixture.faults.tailFormula = '=IF(TRUE,"","")';
    const original = JSON.stringify(fixture.rows);
    assert.throws(() => fixture.context.setupOrders(), { code: "CONFIG" });
    assert.equal(JSON.stringify(fixture.rows), original);
  }
});

test("多人通知傳送中拒絕重入重試，結果寫入失敗後保留已送達者", () => {
  const app = backend();
  app.properties.set("TELEGRAM_NOTIFY_USER_IDS", "111,222");
  const token = app.session();
  app.faults.onTelegram = () => {
    assert.equal(app.invoke("admin.retryNotification", { orderId: app.rows[1][0] }, token).error.code, "BUSY");
  };
  app.faults.telegramResult = id => {
    if (id === "222") app.faults.write = true;
    return { getResponseCode: () => 200, getContentText: () => '{"ok":true}' };
  };
  const receipt = app.invoke("orders.submit", { requestId: randomUUID(), details: submission() });
  assert.equal(receipt.ok, true);
  const states = JSON.parse(app.rows[1][app.rows[0].indexOf("notificationRecipientsJson")]);
  assert.deepEqual(states.map(entry => entry.status), ["sent", "sending"]);
  app.faults.write = false;
  app.faults.telegramResult = null;
  app.rows[1][app.rows[0].indexOf("notificationAt")] = "2020-01-01T00:00:00Z";
  assert.equal(app.invoke("admin.retryNotification", { orderId: receipt.data.orderId }, token).data.status, "sent");
  assert.deepEqual(app.calls.filter(call => call.url.endsWith("/sendMessage"))
    .map(call => JSON.parse(call.options.payload).chat_id), ["111", "222", "222"]);
});

test("未授權、權限撤除與登出後均無法讀寫訂單", () => {
  const app = backend();
  for (const action of [
    "admin.list",
    "admin.update",
    "admin.retryNotification",
  ]) {
    assert.equal(app.invoke(action, {}).error.code, "AUTH");
  }
  const token = app.session();
  assert.equal(app.invoke("admin.list", {}, token).ok, true);
  app.properties.set("ADMIN_TELEGRAM_IDS", "123");
  assert.equal(app.invoke("admin.list", {}, token).error.code, "AUTH");
  app.properties.set("ADMIN_TELEGRAM_IDS", "987654");
  assert.equal(app.invoke("admin.list", {}, token).error.code, "AUTH");
  // 白名單恢復後需要新的登入，原工作階段不會復活。
  app.session();
  assert.equal(app.invoke("auth.logout", {}, token).ok, true);
  assert.equal(app.invoke("admin.list", {}, token).error.code, "AUTH");
});

test("後台修改保留原內容、重新計價並阻擋過期版本；公開清單含獨立旗標", () => {
  const app = backend();
  app.invoke("orders.submit", {
    requestId: randomUUID(),
    details: submission({ nickname: '=HYPERLINK("x")' }),
  });
  const token = app.session();
  const order = app.invoke("admin.list", {}, token).data.orders[0];
  assert.equal(
    app.writes.at(-1)[0][app.rows[0].indexOf("nickname")],
    '\'=HYPERLINK("x")',
  );
  const payload = {
    ...order,
    status: "drafting",
    isRush: true,
    isOnHold: true,
    publicNote: "草圖中",
    adminNote: "僅供內部",
    details: { ...order.details, characterCount: 2 },
  };
  const updated = app.invoke("admin.update", payload, token);
  assert.equal(updated.ok, true);
  assert.equal(updated.data.revision, 2);
  assert.equal(updated.data.details.estimatedPrice.min, 7500);
  assert.equal(updated.data.history[1].before.details.characterCount, 1);
  assert.equal(
    app.invoke("admin.update", payload, token).error.code,
    "CONFLICT",
  );
  const visible = app.invoke("progress.list").data.orders[0];
  assert.equal(visible.status, "drafting");
  assert.equal(visible.isRush, true);
  assert.equal(visible.isOnHold, true);
  assert.equal(updated.data.history[1].before.status, "queued");
  assert.equal(updated.data.history[1].before.isOnHold, false);
  assert.throws(() =>
    validateUpdate(
      { ...payload, status: "completed" },
      order,
      config,
    ),
  );
});

test("收件配額限制與公開／私人分頁皆由後端處理", () => {
  const app = backend();
  app.properties.set("DAILY_ORDER_LIMIT", "1");
  assert.equal(
    app.invoke("orders.submit", {
      requestId: randomUUID(),
      details: submission(),
    }).ok,
    true,
  );
  assert.equal(
    app.invoke("orders.submit", {
      requestId: randomUUID(),
      details: submission(),
    }).error.code,
    "RATE_LIMIT",
  );
  assert.equal(
    app.invoke("progress.list", { offset: -1 }).error.code,
    "VALIDATION",
  );
  assert.equal(app.invoke("progress.list").data.orders.length, 1);
});

test("Telegram 傳送期間管理員的更新不被通知狀態覆蓋", () => {
  const app = backend();
  const token = app.session();
  app.faults.onTelegram = () => {
    const order = app.invoke("admin.list", {}, token).data.orders[0];
    const result = app.invoke(
      "admin.update",
      {
        ...order,
        status: "drafting",
        isRush: true,
        isOnHold: true,
        publicNote: "草圖中",
        adminNote: "同期修改",
      },
      token,
    );
    assert.equal(result.ok, true);
  };
  assert.equal(
    app.invoke("orders.submit", {
      requestId: randomUUID(),
      details: submission(),
    }).ok,
    true,
  );
  const final = app.invoke("admin.list", {}, token).data.orders[0];
  assert.equal(final.status, "drafting");
  assert.equal(final.isRush, true);
  assert.equal(final.isOnHold, true);
  assert.equal(final.adminNote, "同期修改");
  assert.equal(final.revision, 2);
  assert.equal(final.notificationStatus, "sent");
});

test("RS256 驗證真正簽章、audience、nonce、有效期限與 Telegram profile.id", () => {
  const app = backend();
  assert.equal(
    app.context.verifyTelegramToken_(jwt(), "fixture-nonce").id,
    "987654",
  );
  for (const claims of [
    { aud: "another-client" },
    { nonce: "wrong" },
    { exp: 1 },
    { iss: "https://example.com" },
    { id: 123, sub: "987654" },
    { id: null },
    { aud: ["12345", "other"] },
  ])
    assert.throws(() =>
      app.context.verifyTelegramToken_(jwt(claims), "fixture-nonce"),
    );
  const parts = jwt().split(".");
  parts[1] = Buffer.from(JSON.stringify({ id: 987654 })).toString("base64url");
  assert.throws(() =>
    app.context.verifyTelegramToken_(parts.join("."), "fixture-nonce"),
  );
  assert.throws(() =>
    app.context.verifyTelegramToken_(jwt({}, { alg: "none" }), "fixture-nonce"),
  );
});

test("七階段可前進與退回；旗標可並存、解除，不修改急件報價需求", () => {
  const app = backend();
  app.invoke("orders.submit", {
    requestId: randomUUID(),
    details: submission({ service: "chibi", chibiPlan: "animated", rush: true }),
  });
  const token = app.session();
  let order = app.invoke("admin.list", {}, token).data.orders[0];
  assert.equal(order.status, "queued");
  assert.equal(order.isRush, true);
  assert.equal(order.isOnHold, false);
  assert.equal(order.details.estimatedPrice.min, 1800);
  for (const status of [...Object.keys(ORDER_STATUSES), "drafting"]) {
    const result = app.invoke("admin.update", {
      ...order, status, isRush: true, isOnHold: true,
    }, token);
    assert.equal(result.ok, true);
    order = result.data;
    assert.equal(order.status, status);
    assert.equal(order.isRush, true);
    assert.equal(order.isOnHold, true);
  }
  const resumed = app.invoke("admin.update", {
    ...order, isRush: false, isOnHold: false,
  }, token).data;
  assert.equal(resumed.status, "drafting");
  assert.equal(resumed.details.rush, true);
  assert.equal(resumed.details.estimatedPrice.min, 1800);
  assert.equal(resumed.isRush, false);
  assert.equal(resumed.isOnHold, false);
  for (const change of [
    { status: "rush" }, { status: "on_hold" }, { status: "working" },
    { isRush: "true" }, { isOnHold: 1 }, { isOnHold: undefined },
  ]) {
    assert.equal(app.invoke("admin.update", { ...resumed, ...change }, token).error.code, "VALIDATION");
  }
});

test("舊表升級只追加旗標表頭，保留全部訂單；讀取不改寫歷史狀態", () => {
  const app = backend();
  app.invoke("orders.submit", { requestId: randomUUID(), details: submission({ rush: true }) });
  app.rows.forEach((row) => { row.length = 27; });
  app.faults.maxColumns = 27;
  assert.equal(app.invoke("progress.list").error.code, "CONFIG");
  const columns = app.rows[0];
  app.rows[1][columns.indexOf("status")] = "cancelled";
  app.rows[1][columns.indexOf("progress")] = 42;
  app.rows[1][columns.indexOf("publicVisible")] = false;
  app.rows[1][columns.indexOf("publicNote")] = "舊版隱藏說明";
  const before = structuredClone(app.rows);
  app.context.setupOrders();
  assert.equal(app.faults.maxColumns, 32);
  assert.deepEqual(app.rows[0].slice(27), ["isRush", "isOnHold", "notificationRecipientsJson", "sourceJson", "isArchived"]);
  assert.deepEqual(app.rows.map((row) => row.slice(0, 27)), before);
  const writeCount = app.writes.length;
  const visible = app.invoke("progress.list").data;
  assert.equal(visible.total, 1);
  assert.equal(visible.orders[0].status, "queued");
  assert.equal(visible.orders[0].isOnHold, true);
  assert.equal(visible.orders[0].isRush, true);
  assert.equal(visible.orders[0].publicNote, "");
  assert.equal(app.writes.length, writeCount);
  const token = app.session();
  const order = app.invoke("admin.list", {}, token).data.orders[0];
  assert.equal(order.publicNote, "舊版隱藏說明");
  const update = app.invoke("admin.update", { ...order, publicNote: "等待重新安排" }, token);
  assert.equal(update.ok, true);
  assert.equal(update.data.history.at(-1).before.status, "cancelled");
  assert.equal(update.data.history.at(-1).before.progress, 42);
  assert.equal(update.data.history.at(-1).before.publicVisible, false);
  assert.equal(app.invoke("progress.list").data.orders[0].publicNote, "等待重新安排");
  const saved = JSON.stringify(app.rows);
  app.context.setupOrders();
  assert.equal(JSON.stringify(app.rows), saved);
});

test("舊表尾端有資料或公式時升級停止，絕不覆蓋既有欄位", () => {
  for (const occupied of ["data", "formula"]) {
    const app = backend();
    app.rows[0].length = 27;
    if (occupied === "data") app.rows.push([...Array(27).fill(""), "保留內容"]);
    else app.faults.tailFormula = '=IF(TRUE,"","")';
    const before = JSON.stringify(app.rows);
    const writes = app.writes.length;
    assert.throws(() => app.context.setupOrders(), { code: "CONFIG" });
    assert.equal(JSON.stringify(app.rows), before);
    assert.equal(app.writes.length, writes);
  }
});

test("舊狀態的相容投影保留取消標記，未知狀態不被默默當成排隊", () => {
  const legacy = {
    received: "queued", discussing: "queued", queued: "queued",
    working: "finalizing", reviewing: "draft_review", completed: "delivered",
  };
  for (const [status, expected] of Object.entries(legacy)) {
    assert.equal(orderWorkflow({ status }).status, expected);
  }
  assert.equal(orderWorkflow({ status: "cancelled" }).isOnHold, true);
  for (const status of ["unexpected", "__proto__", "constructor"]) {
    assert.throws(() => orderWorkflow({ status }), { code: "CONFIG" });
  }
});

test("公開所有工作的篩選先於分頁，包含舊隱藏工作與已交稿，且無私人欄位", () => {
  const app = backend();
  app.invoke("orders.submit", { requestId: randomUUID(), details: submission() });
  const seed = structuredClone(app.rows[1]);
  const column = (name) => app.rows[0].indexOf(name);
  for (let index = 1; index <= 65; index++) {
    const row = structuredClone(seed);
    row[column("orderId")] = `LL-${String(index).padStart(16, "0")}`;
    row[column("createdAt")] = new Date(Date.UTC(2026, 0, index)).toISOString();
    row[column("status")] = index <= 32 ? "drafting" : "delivered";
    row[column("isRush")] = index <= 32;
    row[column("isOnHold")] = index === 32;
    row[column("publicVisible")] = index !== 32;
    row[column("publicNote")] = index === 32 ? "隱藏說明" : "公開工作";
    app.rows[index] = row;
  }
  const first = app.invoke("progress.list").data;
  assert.equal(first.total, 65);
  assert.equal(first.orders.length, 30);
  assert.equal(first.nextOffset, 30);
  const end = app.invoke("progress.list", { offset: 60 }).data;
  assert.equal(end.orders.length, 5);
  assert.equal(end.nextOffset, null);
  assert.ok(end.orders.every((order) => order.status === "delivered"));
  const filtered = app.invoke("progress.list", { status: "drafting", flag: "rush", offset: 30 }).data;
  assert.equal(filtered.total, 32);
  assert.equal(filtered.orders.length, 2);
  assert.equal(filtered.nextOffset, null);
  const held = app.invoke("progress.list", { flag: "on_hold" }).data;
  assert.equal(held.total, 1);
  assert.equal(held.orders[0].orderId, "LL-0000000000000032");
  assert.equal(held.orders[0].publicNote, "");
  assert.deepEqual(Object.keys(held.orders[0]), [
    "orderId", "service", "status", "isRush", "isOnHold", "isArchived", "publicNote", "updatedAt", "displayTitle",
  ]);
  assert.equal(app.invoke("progress.list", { status: "drafting", flag: "on_hold", offset: 1 }).data.orders.length, 0);
  assert.equal(app.invoke("progress.list", { status: "awaiting_payment" }).data.total, 0);
  for (const payload of [{ status: "cancelled" }, { status: false }, { flag: "admin" }, { offset: "0" }]) {
    assert.equal(app.invoke("progress.list", payload).error.code, "VALIDATION");
  }
});

test("管理回程支援目錄網址與舊連結，仍拒絕非 HTTPS、query 與 fragment", () => {
  const app = backend();
  for (const url of [
    "https://example.com/lanlan-pages/admin/",
    "https://example.com/lanlan-pages/admin.html",
  ]) {
    app.properties.set("ADMIN_URL", url);
    assert.equal(app.context.adminUrl_(), url);
  }
  for (const url of [
    "http://example.com/admin/",
    "https://example.com/admin",
    "https://example.com/admin/?next=other",
    "https://example.com/admin/#ticket=fixture",
    "https://example.com/admin/other",
    "https://example.com/commission/",
  ]) {
    app.properties.set("ADMIN_URL", url);
    assert.throws(() => app.context.adminUrl_());
  }
});

test("OIDC 使用 PKCE 與單次 state；綁定原瀏覽器的票證只建立一次工作階段並可重取遺失回應", () => {
  const app = backend();
  const browserKey = "a".repeat(64);
  const start = app.invoke("auth.start", { browserKey });
  const url = new URL(start.data.url);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const state = url.searchParams.get("state");
  app.faults.token = jwt({ nonce: url.searchParams.get("nonce") });
  const { destination } = app.context.completeLogin_({
    state,
    code: "fixture-code",
  });
  assert.equal(new URL(destination).pathname, "/lanlan-pages/admin/");
  assert.throws(() =>
    app.context.completeLogin_({ state, code: "fixture-code" }),
  );
  const ticket = new URLSearchParams(new URL(destination).hash.slice(1)).get(
    "ticket",
  );
  assert.equal(
    app.invoke("auth.exchange", { ticket, browserKey: "c".repeat(64) }).error
      .code,
    "AUTH",
  );
  const session = app.invoke("auth.exchange", { ticket, browserKey });
  assert.equal(session.ok, true);
  const key = "ticket:" + app.context.digest_(ticket);
  const until = app.cache.get(key).until;
  assert.deepEqual(app.invoke("auth.exchange", { ticket, browserKey }).data, session.data);
  assert.equal(app.cache.get(key).until, until);
  assert.equal(app.invoke("auth.exchange", { ticket, browserKey: "c".repeat(64) }).error.code, "AUTH");
  assert.equal(app.invoke("admin.list", {}, session.data.token).ok, true);
  app.invoke("auth.logout", {}, session.data.token);
  assert.equal(app.invoke("auth.exchange", { ticket, browserKey }).error.code, "AUTH");
  app.cache.get(key).until = Date.now() - 1;
  assert.equal(app.invoke("auth.exchange", { ticket, browserKey }).error.code, "AUTH");
});

test("Html Service API 與 POST 共用權限及驗證，不公開管理資料或擁有者入口", () => {
  const app = backend();
  const rpc = (action, payload = {}, token = "") => JSON.parse(app.context.callApi(JSON.stringify({ action, payload, token })));
  assert.equal(rpc("admin.list").error.code, "AUTH");
  assert.equal(rpc("admin.update").error.code, "AUTH");
  assert.equal(rpc("setupOrders").error.code, "AUTH");
  assert.equal(rpc("admin.list", {}, app.session()).ok, true);
  assert.deepEqual(rpc("progress.list"), app.invoke("progress.list"));
  assert.equal(JSON.parse(app.context.callApi("x".repeat(40001))).error.code, "VALIDATION");
});

test("前端 API 只有可解析且明確成功的回應才完成送件，不使用 no-cors", async () => {
  let options;
  const api = createApi("https://example.com", async (_, input) => {
    options = input;
    return {
      ok: true,
      json: async () => ({ ok: true, data: { orderId: "LL-fixture" } }),
    };
  });
  assert.equal((await api("orders.submit", {})).orderId, "LL-fixture");
  assert.equal(options.credentials, "omit");
  assert.equal(options.headers["Content-Type"], "text/plain;charset=UTF-8");
  for (const response of [
    { ok: false },
    { ok: true, json: async () => ({}) },
  ]) {
    await assert.rejects(
      createApi("https://example.com", async () => response)("orders.submit"),
      { code: "NETWORK" },
    );
  }
  await assert.rejects(createApi("")("orders.submit"), {
    code: "NOT_CONFIGURED",
  });
});
