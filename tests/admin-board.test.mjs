import test from "node:test";
import assert from "node:assert/strict";
import { loadBoardOrders } from "../src/features/orders/board-data.js";
import { filterBoard } from "../src/features/orders/board.js";

test("管理看板讀完所有分頁才提供完整快照，後續頁可搜尋且件數符合旗標", async () => {
  const source = Array.from({ length: 65 }, (_, index) => ({
    orderId: `LL-${index}`, details: { nickname: `測試 ${index}` },
    service: "chibi", status: index < 60 ? "delivered" : "queued",
    isRush: index === 64, isOnHold: index === 64,
  }));
  const offsets = [];
  const progress = [];
  const snapshot = await loadBoardOrders(async (action, { offset, delivery }, token) => {
    assert.equal(action, "admin.list");
    assert.equal(delivery, "all");
    assert.equal(token, "fixture-session");
    offsets.push(offset);
    return { orders: source.slice(offset, offset + 30), total: 65, nextOffset: offset + 30 < 65 ? offset + 30 : null };
  }, { admin: true, token: "fixture-session", delivery: "all",
    onProgress: (loaded, total) => progress.push([loaded, total]) });
  assert.deepEqual(offsets, [0, 30, 60]);
  assert.deepEqual(progress, [[30, 65], [60, 65], [65, 65]]);
  assert.equal(filterBoard(snapshot, {}).stageCounts.delivered, 60);
  for (const flag of ["rush", "on_hold"]) {
    const result = filterBoard(snapshot, { flag, search: " ll-64 " });
    assert.equal(result.total, 1);
    assert.equal(result.stageCounts.queued, 1);
  }
  assert.equal(filterBoard(snapshot, { search: "測試 64", service: "animation" }).total, 0);
});

test("分頁失敗或總數變動不回傳部分看板，也不在讀取中寫入訂單", async () => {
  const first = { orders: [{ orderId: "LL-1" }], total: 2, nextOffset: 30 };
  for (const second of [new Error("讀取失敗"), { orders: [], total: 3, nextOffset: null }]) {
    await assert.rejects(loadBoardOrders(async (action, { offset }) => {
      assert.equal(action, "admin.list");
      if (!offset) return first;
      if (second instanceof Error) throw second;
      return second;
    }, { admin: true, token: "fixture" }));
  }
});

test("管理看板拒絕循環游標、重複而缺漏的訂單，空清單可正常完成", async () => {
  await assert.rejects(loadBoardOrders(async () => ({ orders: [], total: 1, nextOffset: 0 })));
  await assert.rejects(loadBoardOrders(async () => ({ orders: [{ orderId: "LL-1" }, { orderId: "LL-1" }], total: 2, nextOffset: null })));
  assert.deepEqual(await loadBoardOrders(async () => ({ orders: [], total: 0, nextOffset: null })), []);
});
