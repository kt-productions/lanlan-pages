import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { backend, submission } from "./helpers/apps-script.mjs";
import { filterBoard } from "../src/features/orders/board.js";
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
    assert.ok(result.orders.every(order => order.status === "draft_review"));
  }
  assert.equal(JSON.stringify(app.rows), before);
  const token = app.session();
  const order = app.invoke("admin.list", {}, token).data.orders.find(item => item.orderId !== "LL-SECOND");
  const updated = app.invoke("admin.update", { ...order, status: "awaiting_payment" }, token);
  assert.equal(updated.ok, true);
  assert.equal(updated.data.status, "draft_review");
  assert.equal(updated.data.history.at(-1).before.status, "awaiting_payment");
  const legacy = filterBoard([{ ...order, status: "awaiting_payment" }, { ...order, orderId: "other" }], {});
  assert.equal(legacy.stageCounts.draft_review, 2);
});

test("公開及管理分頁都按原始建立時間排序，前端補載後相同且不依修改時間或原看板順序", () => {
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
  app.rows[3][column("sourceJson")] = JSON.stringify({ kind: "trello", cardId: "60000000" + "0".repeat(16),
    boardOrder: 9, listPosition: 999, cardPosition: 999, archived: false, publishTitle: false });
  const expected = ["LL-2", "LL-1", "LL-0"];
  const pub = app.invoke("progress.list", { limit: 200 }).data.orders;
  const admin = app.invoke("admin.list", {}, app.session()).data.orders;
  for (const orders of [pub, admin]) {
    assert.deepEqual(Array.from(orders, order => order.orderId), expected);
    assert.deepEqual(filterBoard([...orders].reverse(), {}).orders.map(order => order.orderId), expected);
  }
  assert.equal(app.invoke("progress.list", { limit: 1, offset: 1 }).data.orders[0].orderId, "LL-1");
});

test("拖曳更新保留需求、附加狀態與備註，記錄歷史，拒絕舊版本與未登入，且不通知", () => {
  const app = backend();
  app.invoke("orders.submit", { requestId: randomUUID(), details: submission({ service: "chibi", chibiPlan: "animated" }) });
  const token = app.session();
  const order = app.invoke("admin.list", {}, token).data.orders[0];
  const prepared = app.invoke("admin.update", { ...order, isRush: true, isOnHold: true,
    publicNote: "公開說明", adminNote: "內部備註" }, token).data;
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
  assert.equal(app.invoke("admin.update", statusUpdate(result.data, "delivered")).error.code, "AUTH");
  assert.equal(app.calls.length, notifications);
  assert.throws(() => statusUpdate(prepared, "__proto__"), /狀態不正確/);
});
