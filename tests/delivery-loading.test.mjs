import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { backend, submission } from "./helpers/apps-script.mjs";
import { loadBoardOrders, mergeDeliveredOrders } from "../src/features/orders/board-data.js";
import { filterBoard } from "../src/features/orders/board.js";

function fixture() {
  const app = backend();
  app.invoke("orders.submit", { requestId: randomUUID(), details: submission() });
  const columns = app.rows[0];
  const seed = [...app.rows[1]];
  for (let index = 0; index < 100; index++) {
    const row = [...seed];
    row[columns.indexOf("orderId")] = `LL-${index.toString(16).padStart(16, "0").toUpperCase()}`;
    row[columns.indexOf("status")] = index < 35 ? "drafting" : index % 2 ? "completed" : "delivered";
    row[columns.indexOf("isArchived")] = index === 0 || index === 99;
    row[columns.indexOf("isRush")] = true;
    app.rows[index + 1] = row;
  }
  return app;
}

test("交稿範圍在伺服器分頁之前套用，保留封存界線及舊狀態對應", async () => {
  const app = fixture();
  const token = app.session();
  const before = JSON.stringify(app.rows);
  const writes = app.writes.length;
  const notifications = app.calls.length;
  for (const admin of [false, true]) {
    const requests = [];
    const api = async (action, payload, session) => {
      requests.push(payload);
      const response = app.invoke(action, payload, session);
      assert.equal(response.ok, true);
      return response.data;
    };
    const active = await loadBoardOrders(api, { admin, token });
    assert.equal(active.length, admin ? 35 : 34);
    assert.ok(active.every(order => order.status === "drafting"));
    assert.ok(requests.every(payload => payload.delivery === "active"));
    assert.deepEqual(requests.map(payload => payload.offset), admin ? [0, 30] : [0]);
    requests.length = 0;
    const delivered = await loadBoardOrders(api, { admin, token, delivery: "delivered" });
    assert.equal(delivered.length, admin ? 65 : 64);
    assert.ok(delivered.every(order => order.status === "delivered"));
    assert.ok(requests.every(payload => payload.delivery === "delivered"));
    assert.deepEqual(requests.map(payload => payload.offset), admin ? [0, 30, 60] : [0]);
    const merged = mergeDeliveredOrders(active, delivered);
    assert.equal(merged.length, admin ? 100 : 98);
    assert.equal(filterBoard(merged, {}).stageCounts.delivered, 64);
    assert.equal(filterBoard(merged, { flag: "archived" }).total, admin ? 2 : 0);
  }
  const page = app.invoke("progress.list", { delivery: "delivered", offset: 30, limit: 30, flag: "rush" }).data;
  assert.equal(page.total, 64);
  assert.equal(page.stageCounts.delivered, 64);
  assert.equal(page.stageCounts.drafting, 0);
  assert.equal(page.orders.length, 30);
  assert.equal(page.nextOffset, 60);
  assert.equal(app.invoke("progress.list", { delivery: "active", status: "delivered" }).data.total, 0);
  assert.equal(app.invoke("progress.list").data.total, 98, "省略交稿範圍仍相容舊版前端");
  assert.equal(app.invoke("admin.list", {}, token).data.total, 100);
  assert.equal(JSON.stringify(app.rows), before);
  assert.equal(app.writes.length, writes);
  assert.equal(app.calls.length, notifications);
});

test("交稿範圍拒絕不合法值，管理清單仍要求登入", () => {
  const app = fixture();
  for (const delivery of [true, null, "completed", "__proto__"]) {
    assert.equal(app.invoke("progress.list", { delivery }).error.code, "VALIDATION");
    assert.equal(app.invoke("admin.list", { delivery }, app.session()).error.code, "VALIDATION");
  }
  assert.equal(app.invoke("admin.list", { delivery: "delivered" }).error.code, "AUTH");
});

test("公開未交稿超過一頁仍完整載入，且不要求已交稿", async () => {
  const source = Array.from({ length: 205 }, (_, index) => ({ orderId: `LL-${index}`, status: "queued" }));
  const calls = [];
  const orders = await loadBoardOrders(async (action, payload) => {
    assert.equal(action, "progress.list");
    assert.equal(payload.delivery, "active");
    assert.equal(payload.limit, 200);
    calls.push(payload.offset);
    return { orders: source.slice(payload.offset, payload.offset + 200), total: 205,
      nextOffset: payload.offset === 0 ? 200 : null };
  });
  assert.equal(orders.length, 205);
  assert.deepEqual(calls, [0, 200]);
});

test("補載會取代已移動階段的同編號資料，並拒絕伺服器錯誤範圍", async () => {
  const previous = [{ orderId: "LL-1", status: "queued" }, { orderId: "LL-2", status: "drafting" }];
  const result = mergeDeliveredOrders(previous, [{ orderId: "LL-1", status: "delivered" }]);
  assert.equal(result.length, 2);
  assert.equal(result.find(order => order.orderId === "LL-1").status, "delivered");
  assert.equal(previous[0].status, "queued", "補載完成前不修改原快照");
  for (const [delivery, status] of [["active", "delivered"], ["delivered", "queued"]]) {
    await assert.rejects(loadBoardOrders(async () => ({ total: 1, nextOffset: null,
      orders: [{ orderId: "LL-1", status }] }), { delivery }), /載入範圍/);
  }
  assert.deepEqual(await loadBoardOrders(async () => ({ total: 0, nextOffset: null, orders: [] }),
    { delivery: "delivered" }), []);
});
