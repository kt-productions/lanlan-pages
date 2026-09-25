import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { backend, submission } from "./helpers/apps-script.mjs";
import { filterBoard } from "../src/features/orders/board.js";
import { loadBoardOrders, mergeDeliveredOrders } from "../src/features/orders/board-data.js";
import { statusUpdate } from "../src/features/orders/board-drag.js";

test("草稿確認與等待付款合併計數，讀取不改寫舊值；舊管理頁儲存也會歸入合併階段", () => {
  const app = backend();
  app.invoke("orders.submit", { requestId: randomUUID(), details: submission() });
  const column = (key) => app.rows[0].indexOf(key);
  app.rows[1][column("status")] = "awaiting_payment";
  const second = [...app.rows[1]];
  second[column("orderId")] = "LL-SECOND";
  second[column("status")] = "draft_review";
  app.rows.push(second);
  const before = JSON.stringify(app.rows);
  for (const status of ["draft_review", "awaiting_payment"]) {
    const result = app.invoke("progress.list", { status }).data;
    assert.equal(result.total, 2);
    assert.equal(result.stageCounts.draft_review, 2);
    assert.equal(Object.keys(result.stageCounts).length, 6);
    assert.ok(result.orders.every((order) => order.status === "draft_review"));
  }
  assert.equal(JSON.stringify(app.rows), before);
  const token = app.session();
  const order = app
    .invoke("admin.list", {}, token)
    .data.orders.find((item) => item.orderId !== "LL-SECOND");
  const updated = app.invoke("admin.update", { ...order, status: "awaiting_payment" }, token);
  assert.equal(updated.ok, true);
  assert.equal(updated.data.status, "draft_review");
  assert.equal(updated.data.history.at(-1).before.status, "awaiting_payment");
  const legacy = filterBoard(
    [
      { ...order, status: "awaiting_payment" },
      { ...order, orderId: "other" },
    ],
    {},
  );
  assert.equal(legacy.stageCounts.draft_review, 2);
});

test("未交稿的公開及管理分頁維持原始建立時間排序，不依修改時間或原看板順序", () => {
  const app = backend();
  app.invoke("orders.submit", { requestId: randomUUID(), details: submission() });
  const column = (key) => app.rows[0].indexOf(key);
  const base = [...app.rows[1]];
  for (const [index, date] of ["2026-09-03", "2026-09-01", "2026-09-02"].entries()) {
    const row = [...base];
    row[column("orderId")] = `LL-${index}`;
    row[column("createdAt")] = `${date}T00:00:00.000Z`;
    row[column("updatedAt")] = `2026-09-${10 - index}T00:00:00.000Z`;
    app.rows[index + 1] = row;
  }
  // 匯入時間比新單晚，Trello 原卡片仍應排在最前。
  app.rows[3][column("sourceJson")] = JSON.stringify({
    kind: "trello",
    cardId: "60000000" + "0".repeat(16),
    boardOrder: 9,
    listPosition: 999,
    cardPosition: 999,
    archived: false,
    publishTitle: false,
  });
  const expected = ["LL-2", "LL-1", "LL-0"];
  const pub = app.invoke("progress.list", { limit: 200 }).data.orders;
  const admin = app.invoke("admin.list", {}, app.session()).data.orders;
  for (const orders of [pub, admin]) {
    assert.deepEqual(
      Array.from(orders, (order) => order.orderId),
      expected,
    );
    assert.deepEqual(
      filterBoard([...orders].reverse(), {}).orders.map((order) => order.orderId),
      expected,
    );
  }
  assert.equal(app.invoke("progress.list", { limit: 1, offset: 1 }).data.orders[0].orderId, "LL-1");
});

test("已交稿在公開及管理分頁、補載與篩選後都按最後更新由新到舊排列", async () => {
  const app = backend();
  app.invoke("orders.submit", { requestId: randomUUID(), details: submission() });
  const column = (key) => app.rows[0].indexOf(key);
  const base = [...app.rows[1]];
  const ids = Array.from({ length: 33 }, (_, index) => `LL-${String(index).padStart(2, "0")}`);
  for (const [index, id] of ids.entries()) {
    const row = [...base];
    row[column("orderId")] = id;
    row[column("status")] = index === 0 ? "completed" : "delivered";
    const date = new Date(Date.UTC(2026, 7, index + 1)).toISOString();
    row[column("createdAt")] = date;
    row[column("updatedAt")] = date;
    app.rows[index + 1] = row;
  }
  app.rows[33][column("sourceJson")] = JSON.stringify({
    kind: "trello",
    cardId: "60000000" + "0".repeat(16),
    lastActivity: "2020-01-01T00:00:00Z",
    archived: false,
    publishTitle: false,
  });
  const before = JSON.stringify(app.rows);
  const expected = [...ids].reverse();
  for (const admin of [false, true]) {
    const token = admin ? app.session() : "";
    const action = admin ? "admin.list" : "progress.list";
    const page = app.invoke(action, { delivery: "delivered", offset: 30, limit: 30 }, token).data;
    assert.deepEqual(Array.from(page.orders, (order) => order.orderId), expected.slice(30));
    const snapshot = await loadBoardOrders(
      async (name, payload, credential) => {
        const response = app.invoke(name, { ...payload, limit: 30 }, credential);
        assert.equal(response.ok, true);
        return response.data;
      },
      { admin, token, delivery: "delivered" },
    );
    assert.deepEqual(snapshot.map((order) => order.orderId), expected);
    const active = [
      { orderId: "ACTIVE-NEW", status: "queued", createdAt: "2026-08-20" },
      { orderId: "ACTIVE-OLD", status: "queued", createdAt: "2026-08-10" },
    ];
    const mixed = mergeDeliveredOrders([...active, snapshot[0]], [...snapshot].reverse());
    assert.deepEqual(
      filterBoard(mixed, {}).orders.map((order) => order.orderId),
      ["ACTIVE-OLD", "ACTIVE-NEW", ...expected],
    );
    assert.deepEqual(
      filterBoard(mixed, { search: "LL-", service: base[column("service")] }).orders.map(
        (order) => order.orderId,
      ),
      expected,
    );
  }
  assert.equal(JSON.stringify(app.rows), before);
});

test("已交稿同時間按編號排序，空值或無效更新時間放最後且不借用其他日期", () => {
  const orders = [
    { orderId: "MISSING", updatedAt: "", createdAt: "2099-01-01" },
    { orderId: "SAME-B", updatedAt: "2026-09-25T00:00:00Z" },
    { orderId: "INVALID", updatedAt: "invalid", trelloUpdatedAt: "2099-01-01" },
    { orderId: "OLDER", updatedAt: "2026-09-24T00:00:00Z" },
    { orderId: "SAME-A", updatedAt: "2026-09-25T08:00:00+08:00" },
  ].map((order) => ({ ...order, status: "delivered" }));
  const expected = ["SAME-A", "SAME-B", "OLDER", "INVALID", "MISSING"];
  for (const snapshot of [orders, [...orders].reverse()]) {
    assert.deepEqual(filterBoard(snapshot, {}).orders.map((order) => order.orderId), expected);
  }
});

test("編輯已交稿後使用伺服器更新時間移到最上方", () => {
  const app = backend();
  app.invoke("orders.submit", { requestId: randomUUID(), details: submission() });
  const column = (key) => app.rows[0].indexOf(key);
  const base = [...app.rows[1]];
  for (const [index, id] of ["LL-OLD", "LL-NEW"].entries()) {
    const row = [...base];
    row[column("orderId")] = id;
    row[column("status")] = "delivered";
    row[column("updatedAt")] = `2020-01-0${index + 1}T00:00:00Z`;
    app.rows[index + 1] = row;
  }
  const token = app.session();
  const orders = app.invoke("admin.list", { delivery: "delivered" }, token).data.orders;
  assert.equal(orders[0].orderId, "LL-NEW");
  const result = app.invoke("admin.update", { ...orders[1], publicNote: "更新交稿說明" }, token);
  assert.equal(result.ok, true);
  assert.equal(filterBoard([orders[0], result.data], {}).orders[0].orderId, "LL-OLD");
  assert.equal(
    app.invoke("progress.list", { delivery: "delivered", limit: 1 }).data.orders[0].orderId,
    "LL-OLD",
  );
});

test("拖曳更新保留需求、附加狀態與備註，記錄歷史，拒絕舊版本與未登入，且不通知", () => {
  const app = backend();
  app.invoke("orders.submit", {
    requestId: randomUUID(),
    details: submission({ service: "chibi", chibiPlan: "animated" }),
  });
  const token = app.session();
  const order = app.invoke("admin.list", {}, token).data.orders[0];
  const prepared = app.invoke(
    "admin.update",
    { ...order, isRush: true, isOnHold: true, publicNote: "公開說明", adminNote: "內部備註" },
    token,
  ).data;
  const notifications = app.calls.length;
  const payload = statusUpdate(prepared, "draft_review");
  const result = app.invoke("admin.update", payload, token);
  assert.equal(result.ok, true);
  assert.equal(result.data.status, "draft_review");
  for (const key of ["details", "isRush", "isOnHold", "isArchived", "publicNote", "adminNote"]) {
    assert.deepEqual(result.data[key], prepared[key]);
  }
  assert.equal(prepared.status, "queued");
  assert.equal(result.data.revision, prepared.revision + 1);
  assert.equal(result.data.history.at(-1).before.status, "queued");
  assert.equal(app.invoke("admin.update", payload, token).error.code, "CONFLICT");
  assert.equal(
    app.invoke("admin.update", statusUpdate(result.data, "delivered")).error.code,
    "AUTH",
  );
  assert.equal(app.calls.length, notifications);
  assert.throws(() => statusUpdate(prepared, "__proto__"), /狀態不正確/);
});
