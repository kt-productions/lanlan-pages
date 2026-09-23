import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { backend, submission, config } from "./helpers/apps-script.mjs";
import { validateQuote, validateSubmission, validateUpdate } from "../src/features/orders/contract.js";
import { statusUpdate } from "../src/features/orders/board-drag.js";
import { prepareTrelloImport } from "../scripts/lib/trello-import.mjs";

const quote = (items = [{ label: "基本費", amount: 1200 }, { label: "複雜費", amount: 150.25 }]) =>
  ({ currency: "TWD", amount: 1, items });
function create(service = "chibi") {
  const app = backend();
  const token = app.session();
  app.invoke("orders.submit", { requestId: randomUUID(), details: submission({ service, chibiPlan: "animated", stickerIds: [1, 2] }) });
  return { app, token, order: app.invoke("admin.list", {}, token).data.orders[0] };
}

test("明細以整數分加總，支援折扣與零元，不採用客戶端總額", () => {
  const result = validateQuote(quote([{ label: " 基本費 ", amount: "0.10" }, { label: "加價", amount: 0.2 }, { label: "折扣", amount: -0.01 }]));
  assert.equal(result.amount, 0.29);
  assert.equal(result.items[0].label, "基本費");
  assert.equal(validateQuote(quote([{ label: "贈送", amount: 0 }])).amount, 0);
  assert.equal(validateQuote({ currency: "TWD", amount: "0", items: null }, true).amount, 0);
  assert.equal(validateQuote(null), null);
});

test("拒絕空值、非金額、小數過多、負總額及過大明細，歷史單拒絕明細", () => {
  for (const amount of ["", " ", null, true, "1e2", "1,000", "0.001", 0.001, NaN, Infinity, 10000000]) {
    assert.throws(() => validateQuote(quote([{ label: "項目", amount }])), { code: "VALIDATION" });
  }
  for (const items of [[], Array(51).fill({ label: "項目", amount: 1 }), [null],
    [{ label: " ", amount: 1 }], [{ label: "x".repeat(121), amount: 1 }],
    [{ label: "折扣", amount: -1 }], [{ label: "費用", amount: 9999999.99 }, { label: "加價", amount: 0.01 }]]) {
    assert.throws(() => validateQuote(quote(items)), { code: "VALIDATION" });
  }
  assert.throws(() => validateQuote({ ...quote(), currency: "USD" }), { code: "VALIDATION" });
  assert.throws(() => validateQuote(quote(), true), { code: "VALIDATION" });
  assert.throws(() => validateQuote({ currency: "TWD", amount: -1, items: null }, true), { code: "VALIDATION" });
});

test("三種類型可保存明細並讀回，預估、收件回執及公開回應不混入管理報價", () => {
  for (const service of ["animation", "chibi", "stickers"]) {
    const { app, token, order } = create(service);
    const notices = app.calls.length;
    const result = app.invoke("admin.update", { ...order, quote: quote() }, token);
    assert.equal(result.ok, true);
    assert.equal(result.data.details.quote.amount, 1350.25);
    assert.deepEqual(result.data.details.estimatedPrice, order.details.estimatedPrice);
    assert.equal(result.data.details.priceConfirmed, false);
    assert.equal(result.data.history.at(-1).before.details.quote, undefined);
    assert.deepEqual(app.invoke("admin.list", {}, token).data.orders[0].details.quote, result.data.details.quote);
    const changed = app.invoke("admin.update", { ...result.data, quote: quote([{ label: "調整後金額", amount: 1500 }]) }, token).data;
    assert.equal(changed.history.at(-1).before.details.quote.amount, 1350.25);
    const publicOrder = app.invoke("progress.list").data.orders[0];
    assert.equal(publicOrder.quote, undefined);
    assert.equal(publicOrder.details, undefined);
    assert.equal(JSON.stringify(publicOrder).includes("調整後金額"), false);
    assert.equal(app.calls.length, notices);
    assert.equal(app.rows[0].length, 32);
  }
  const details = validateSubmission(submission({ quote: quote(), estimatedPrice: { min: 1 }, priceConfirmed: true }), config);
  assert.equal(details.quote, undefined);
  assert.equal(details.priceConfirmed, false);
});

test("拖曳、舊管理頁及偽造 details.quote 不覆蓋已存報價；清除仍留下歷史", () => {
  const { app, token, order } = create();
  const saved = app.invoke("admin.update", { ...order, quote: quote() }, token).data;
  const moved = app.invoke("admin.update", statusUpdate(saved, "drafting"), token).data;
  assert.deepEqual(moved.details.quote, saved.details.quote);
  const payload = { ...moved, details: { ...moved.details, quote: quote(), chibiPlan: "illustration" } };
  const updated = app.invoke("admin.update", payload, token).data;
  assert.deepEqual(updated.details.quote, saved.details.quote);
  assert.equal(updated.details.estimatedPrice.min, 600);
  const cleared = app.invoke("admin.update", { ...updated, quote: null }, token).data;
  assert.equal(cleared.details.quote, null);
  assert.deepEqual(cleared.history.at(-1).before.details.quote, saved.details.quote);
});

test("報價沿用管理權限、版本衝突及寫入錯誤保護", () => {
  const { app, token, order } = create();
  const payload = { ...order, quote: quote() };
  const before = JSON.stringify(app.rows);
  assert.equal(app.invoke("admin.update", payload).error.code, "AUTH");
  assert.equal(app.invoke("admin.update", { ...payload, quote: quote([{ label: "折扣", amount: -1 }]) }, token).error.code, "VALIDATION");
  app.faults.write = true;
  assert.equal(app.invoke("admin.update", payload, token).error.code, "SERVER");
  assert.equal(JSON.stringify(app.rows), before);
  app.faults.write = false;
  assert.equal(app.invoke("admin.update", payload, token).ok, true);
  assert.equal(app.invoke("admin.update", payload, token).error.code, "CONFLICT");
});

test("Trello 只新增手動總額，原始表單、來源、通知與預估空值完整保留", () => {
  const app = backend();
  app.context.importTrelloOrders_(prepareTrelloImport([{
    service: "chibi", stages: { ["c".repeat(24)]: "queued" },
    board: { id: "b".repeat(24), name: "虛構看板", prefs: { permissionLevel: "public" },
      lists: [{ id: "c".repeat(24), name: "排隊中", pos: 1 }],
      cards: [{ id: "a".repeat(24), idList: "c".repeat(24), name: "虛構歷史單", shortUrl: "https://trello.com/c/fixture",
        pos: 1, closed: false, dateLastActivity: "2026-09-01T00:00:00Z", labels: [], attachments: [] }] },
  }], { includeArchived: true, publishTitle: true }));
  const token = app.session();
  const order = app.invoke("admin.list", {}, token).data.orders[0];
  const original = JSON.stringify(order);
  validateUpdate({ ...order, quote: { currency: "TWD", amount: 0, items: null } }, order, config);
  assert.equal(JSON.stringify(order), original);
  const result = app.invoke("admin.update", { ...order, details: submission(), quote: { currency: "TWD", amount: 888.88, items: null } }, token);
  assert.equal(result.ok, true);
  const { quote: saved, ...details } = result.data.details;
  assert.deepEqual(details, order.details);
  assert.equal(saved.amount, 888.88);
  assert.equal(saved.items, null);
  assert.deepEqual(result.data.source, order.source);
  assert.deepEqual(result.data.history.at(-1).before.details, order.details);
  const moved = app.invoke("admin.update", statusUpdate(result.data, "drafting"), token).data;
  assert.deepEqual(moved.details.quote, saved);
  assert.equal(app.invoke("admin.update", { ...moved, quote: quote() }, token).error.code, "VALIDATION");
  assert.equal(app.calls.length, 0);
});
