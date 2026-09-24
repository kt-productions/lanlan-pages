import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { backend, submission } from "./helpers/apps-script.mjs";
import { prepareTrelloImport } from "../scripts/lib/trello-import.mjs";
import { filterBoard } from "../src/features/orders/board.js";
import { trelloCreatedAt } from "../src/features/orders/contract.js";

function fixture(count = 2) {
  const board = {
    id: "b".repeat(24),
    name: "虛構看板",
    prefs: { permissionLevel: "public" },
    lists: [{ id: "c".repeat(24), name: "虛構階段", pos: 1 }],
    cards: Array.from({ length: count }, (_, i) => ({
      id: i.toString(16).padStart(24, "0"),
      idList: "c".repeat(24),
      name: "=虛構同名委託",
      shortUrl: `https://trello.com/c/test${i}`,
      pos: count - i,
      closed: i === 0,
      dateLastActivity: "2026-09-01T00:00:00Z",
      labels: [{ name: "已收訂金" }, { name: "加急" }, { name: "擱置" }],
      attachments: [
        {
          name: "虛構圖片.png",
          url: "https://trello.com/1/cards/fixture/attachments/fixture/download/fixture.png",
        },
      ],
    })),
  };
  return { board, service: "chibi", stages: { ["c".repeat(24)]: "queued" } };
}
const batch = (count) =>
  prepareTrelloImport([fixture(count)], { includeArchived: true, publishTitle: true });

test("舊匯入批次的等待付款歸入合併階段，來源名稱維持原文", () => {
  const app = backend();
  const data = batch();
  data.cards[0].status = "awaiting_payment";
  data.cards[0].source.listName = "等待付款";
  app.context.importTrelloOrders_(data);
  const order = app
    .invoke("admin.list", {}, app.session())
    .data.orders.find((order) => order.source.listName === "等待付款");
  assert.equal(order.status, "draft_review");
  assert.equal(order.source.listName, "等待付款");
  assert.equal(app.calls.length, 0);
});

test("Trello Card ID 換算秒級建立時間；讀取舊匯入補時間但不改寫原資料", () => {
  const id = Math.floor(Date.parse("2025-03-14T01:02:03Z") / 1000).toString(16) + "0".repeat(16);
  assert.equal(trelloCreatedAt(id), "2025-03-14T01:02:03.000Z");
  assert.equal(trelloCreatedAt("not-a-card"), null);
  const app = backend();
  const data = batch();
  data.cards[0].source.cardId = id;
  app.context.importTrelloOrders_(data);
  const before = JSON.stringify(app.rows);
  const publicOrder = app.invoke("progress.list", { limit: 200 }).data.orders[0];
  assert.equal(publicOrder.trelloCreatedAt, "2025-03-14T01:02:03.000Z");
  assert.equal(publicOrder.trelloUpdatedAt, data.cards[0].source.lastActivity);
  assert.equal(publicOrder.importedAt, publicOrder.updatedAt);
  assert.equal(JSON.stringify(app.rows), before);
});

test("完整看板快照可立即篩選；空結果與雙旗標的欄位件數一致", () => {
  const snapshot = [
    { service: "chibi", status: "queued", isRush: true, isOnHold: true },
    { service: "animation", status: "delivered", isRush: false, isOnHold: false },
    { service: "chibi", status: "delivered", isRush: true, isOnHold: false },
  ];
  const filtered = filterBoard(snapshot, { service: "chibi", flag: "rush" });
  assert.equal(filtered.total, 2);
  assert.equal(filtered.stageCounts.queued, 1);
  assert.equal(filtered.stageCounts.delivered, 1);
  assert.equal(filterBoard(snapshot, { flag: "on_hold" }).total, 1);
  assert.equal(filterBoard(snapshot, { status: "drafting" }).total, 0);
  assert.equal(snapshot.length, 3);
});

test("匯入保留同名卡片、封存、順序與原標籤；未對應欄位及非公開來源停止", () => {
  const data = batch();
  assert.equal(data.cards.length, 2);
  assert.equal(data.cards[0].source.cardPosition, 1);
  assert.equal(data.cards[1].source.archived, true);
  assert.equal(data.cards[0].isRush, true);
  assert.equal(data.cards[0].isOnHold, true);
  assert.equal(
    prepareTrelloImport([fixture()], { includeArchived: false, publishTitle: false }).cards.length,
    1,
  );
  const missing = fixture();
  missing.stages = {};
  assert.throws(() =>
    prepareTrelloImport([missing], { includeArchived: true, publishTitle: true }),
  );
  const privateBoard = fixture();
  privateBoard.board.prefs.permissionLevel = "private";
  assert.throws(() =>
    prepareTrelloImport([privateBoard], { includeArchived: true, publishTitle: true }),
  );
});

test("30 欄升級只追加來源，保留原訂單、歷史、通知紀錄；尾端內容或公式停止", () => {
  const app = backend();
  app.invoke("orders.submit", { requestId: randomUUID(), details: submission() });
  app.rows.forEach((row) => {
    row.length = 30;
  });
  const before = structuredClone(app.rows);
  app.faults.maxColumns = 30;
  app.context.setupOrders();
  assert.deepEqual(
    app.rows.map((row) => row.slice(0, 30)),
    before,
  );
  assert.equal(app.rows[0][30], "sourceJson");
  for (const mode of ["data", "formula"]) {
    const blocked = backend();
    blocked.rows[0].length = 30;
    if (mode === "data") blocked.rows.push([...Array(30).fill(""), "保留來源"]);
    else blocked.faults.tailFormula = '=IF(TRUE,"","")';
    const snapshot = JSON.stringify(blocked.rows);
    assert.throws(() => blocked.context.setupOrders(), { code: "CONFIG" });
    assert.equal(JSON.stringify(blocked.rows), snapshot);
  }
});

test("批次匯入不通知、未知欄位不造值；重跑及更新後重跑都不覆蓋", () => {
  const app = backend();
  const result = app.context.importTrelloOrders_(batch());
  assert.equal(result.imported, 2);
  assert.equal(app.calls.length, 0);
  const token = app.session();
  const order = app.invoke("admin.list", {}, token).data.orders[0];
  assert.equal(order.details.contact, null);
  assert.equal(order.details.estimatedPrice, null);
  assert.equal(order.details.allowPortfolio, undefined);
  assert.equal(order.notificationStatus, "not_required");
  assert.match(order.orderId, /^LL-[A-F0-9]{16}$/);
  assert.equal(app.writes.at(-1)[0][11].startsWith("'="), true);
  const changed = app.invoke(
    "admin.update",
    {
      ...order,
      status: "finalizing",
      details: submission({ nickname: "不可覆寫" }),
    },
    token,
  );
  assert.equal(changed.ok, true);
  assert.equal(changed.data.details.nickname, "=虛構同名委託");
  assert.equal(changed.data.history.length, 2);
  const snapshot = JSON.stringify(app.rows);
  assert.equal(app.context.importTrelloOrders_(batch()).skipped, 2);
  assert.equal(JSON.stringify(app.rows), snapshot);
  assert.equal(
    app.invoke("admin.retryNotification", { orderId: order.orderId }, token).data.status,
    "not_required",
  );
  assert.equal(app.calls.length, 0);
  assert.equal(app.invoke("admin.update", order, token).error.code, "CONFLICT");
});

test("匯入權限、整批驗證與失敗後重跑保護", () => {
  const app = backend();
  const invalid = batch();
  invalid.cards[1].source.cardUrl = "https://example.com/unsafe";
  assert.throws(() => app.context.importTrelloOrders_(invalid));
  assert.equal(app.rows.length, 1);
  app.context.Session.getActiveUser = () => ({ getEmail: () => "" });
  assert.throws(() => app.context.importTrelloOrders_(batch()), { code: "FORBIDDEN" });
  app.context.Session.getActiveUser = () => ({ getEmail: () => "owner@example.com" });
  app.faults.flush = true;
  assert.throws(() => app.context.importTrelloOrders_(batch()));
  app.faults.flush = false;
  assert.equal(app.context.importTrelloOrders_(batch()).imported, 0);
  assert.equal(app.rows.length, 3);
});

test("全資料件數、類型篩選及分頁排序；公開保留已核可名稱並排除來源封存卡片", () => {
  const app = backend();
  const data = batch(205);
  data.cards[0].service = "animation";
  data.cards[0].status = "delivered";
  data.cards[1].source.publishTitle = false;
  app.context.importTrelloOrders_(data);
  const page = app.invoke("progress.list", { limit: 200 }).data;
  assert.equal(page.total, 204);
  assert.equal(page.orders.length, 200);
  assert.equal(page.stageCounts.queued, 203);
  assert.equal(page.stageCounts.delivered, 1);
  assert.equal(page.nextOffset, 200);
  const all = [
    ...page.orders,
    ...app.invoke("progress.list", { offset: 200, limit: 200 }).data.orders,
  ];
  assert.deepEqual(
    all.map((order) => order.orderId),
    all.map((order) => order.orderId).sort(),
    "建立時間相同時以委託編號穩定排序，不再採用 Trello 欄位位置",
  );
  assert.equal(all.find((order) => order.service === "animation").displayTitle, "=虛構同名委託");
  assert.equal(all.filter((order) => order.displayTitle === undefined).length, 1);
  assert.equal(page.orders[0].source, undefined);
  assert.ok(!JSON.stringify(page).includes("已收訂金"));
  assert.ok(!JSON.stringify(page).includes("attachments"));
  const filtered = app.invoke("progress.list", { service: "animation", flag: "rush" }).data;
  assert.equal(filtered.total, 1);
  assert.equal(filtered.stageCounts.queued, 0);
  assert.equal(app.invoke("progress.list", { limit: 201 }).ok, false);
  assert.equal(app.invoke("progress.list", { service: "invalid" }).ok, false);
  assert.equal(app.invoke("progress.list", { offset: 200, limit: 200 }).data.orders.length, 4);
  // 匯入時間不是新收件時間，歷史資料不占用今日的新單額度。
  assert.equal(
    app.invoke("orders.submit", { requestId: randomUUID(), details: submission() }).ok,
    true,
  );
});
