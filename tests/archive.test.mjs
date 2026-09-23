import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { backend, submission } from "./helpers/apps-script.mjs";
import { filterBoard } from "../src/features/orders/board.js";

test("封存從公開清單與件數排除，管理僅封存篩選可見，解除後保留工作階段與旗標", () => {
  const app = backend();
  app.invoke("orders.submit", { requestId: randomUUID(), details: submission({ nickname: "公開暱稱" }) });
  const token = app.session();
  const original = app.invoke("admin.list", {}, token).data.orders[0];
  const calls = app.calls.length;
  const saved = app.invoke("admin.update", { ...original, status: "drafting", isRush: true,
    isOnHold: true, isArchived: true }, token);
  assert.equal(saved.ok, true);
  assert.equal(saved.data.isArchived, true);
  assert.equal(saved.data.history.at(-1).before.isArchived, false);
  for (const payload of [{}, { flag: "rush" }, { status: "drafting" }, { flag: "on_hold" }]) {
    const result = app.invoke("progress.list", payload).data;
    assert.equal(result.total, 0);
    assert.equal(result.orders.length, 0);
    assert.equal(result.stageCounts.drafting, 0);
  }
  assert.equal(app.invoke("progress.list", { flag: "archived" }).error.code, "VALIDATION");
  const snapshot = app.invoke("admin.list", {}, token).data.orders;
  for (const flag of ["", "rush", "on_hold"]) assert.equal(filterBoard(snapshot, { flag }).total, 0);
  assert.equal(filterBoard(snapshot, { flag: "archived", search: "公開暱稱" }).total, 1);
  assert.equal(filterBoard(snapshot, { flag: "archived", service: "stickers" }).total, 0);
  const olderClient = { ...saved.data, publicNote: "更新說明" };
  delete olderClient.isArchived;
  const preserved = app.invoke("admin.update", olderClient, token).data;
  assert.equal(preserved.isArchived, true);
  for (const isArchived of ["false", null, 0]) {
    assert.equal(app.invoke("admin.update", { ...preserved, isArchived }, token).error.code, "VALIDATION");
  }
  const restored = app.invoke("admin.update", { ...preserved, isArchived: false }, token).data;
  assert.equal(restored.status, "drafting");
  assert.equal(restored.isRush, true);
  assert.equal(restored.isOnHold, true);
  assert.equal(restored.history.at(-1).before.isArchived, true);
  const publicPage = app.invoke("progress.list").data;
  assert.equal(publicPage.total, 1);
  assert.equal(publicPage.orders[0].displayTitle, "公開暱稱");
  assert.equal(filterBoard([restored], { flag: "archived" }).total, 0);
  assert.equal(filterBoard([restored], {}).total, 1);
  assert.equal(app.calls.length, calls, "封存與解除不發送收件通知");
});

test("31 欄升級只追加封存欄，舊 Trello 封存預設隱藏且可明確解除", () => {
  const app = backend();
  app.invoke("orders.submit", { requestId: randomUUID(), details: submission() });
  const columns = app.rows[0];
  app.rows[1][columns.indexOf("sourceJson")] = JSON.stringify({ kind: "trello", archived: true,
    publishTitle: true, cardName: "封存來源範例", cardId: "1234567890abcdef12345678" });
  app.rows.forEach(row => { row.length = 31; });
  app.faults.maxColumns = 31;
  const before = structuredClone(app.rows);
  app.context.setupOrders();
  assert.equal(app.rows[0][31], "isArchived");
  assert.deepEqual(app.rows.map(row => row.slice(0, 31)), before);
  const token = app.session();
  const saved = app.invoke("admin.list", {}, token).data.orders[0];
  assert.equal(saved.isArchived, true);
  assert.equal(app.invoke("progress.list").data.total, 0);
  const restored = app.invoke("admin.update", { ...saved, isArchived: false }, token).data;
  assert.equal(restored.isArchived, false);
  assert.equal(restored.source.archived, true, "保留原始來源狀態");
  assert.equal(app.invoke("progress.list").data.total, 1);
});

test("32 欄已有資料或公式時拒絕升級；公開封存在分頁前排除", () => {
  for (const formula of [false, true]) {
    const app = backend();
    app.rows[0].length = 31;
    if (formula) app.faults.tailFormula = '=IF(TRUE,"","")';
    else app.rows.push([...Array(31).fill(""), "保留資料"]);
    const before = structuredClone(app.rows);
    assert.throws(() => app.context.setupOrders(), { code: "CONFIG" });
    assert.deepEqual(app.rows, before);
  }
  const app = backend();
  app.invoke("orders.submit", { requestId: randomUUID(), details: submission() });
  const columns = app.rows[0];
  const seed = app.rows[1];
  for (let index = 0; index < 65; index++) {
    const row = [...seed];
    row[columns.indexOf("orderId")] = `LL-${index.toString(16).padStart(16, "0")}`;
    row[columns.indexOf("isArchived")] = index < 32;
    app.rows[index + 1] = row;
  }
  const page = app.invoke("progress.list", { offset: 30 }).data;
  assert.equal(page.total, 33);
  assert.equal(page.orders.length, 3);
  assert.equal(page.nextOffset, null);
  assert.equal(page.stageCounts.queued, 33);
});
