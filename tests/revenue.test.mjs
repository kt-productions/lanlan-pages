import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { backend, submission, config } from "./helpers/apps-script.mjs";
import { buildRevenueReport, deliveredDate } from "../src/features/orders/revenue.js";
import {
  validateRevenue,
  validateSubmission,
  revenueDate,
  taipeiDate,
} from "../src/features/orders/contract.js";
import { statusUpdate } from "../src/features/orders/board-drag.js";
import { setupRevenueEditor } from "../src/features/orders/revenue-editor.js";

const revenue = (overrides) => ({
  depositAmount: 0,
  depositReceivedOn: null,
  expectedDeliveryOn: null,
  deliveredOn: null,
  ...overrides,
});
const fixture = (orderId, amount, status, dates = {}) => ({
  orderId,
  service: "chibi",
  status,
  isArchived: false,
  createdAt: "2020-01-01T00:00:00Z",
  updatedAt: "2030-01-01T00:00:00Z",
  details: {
    nickname: `虛構${orderId}`,
    quote: amount === null ? null : { currency: "TWD", amount, items: null },
    revenue: revenue(dates),
    estimatedPrice: { min: 9000, max: 10000 },
  },
  history: [],
});
const quote = (amount) => ({ currency: "TWD", items: [{ label: "正式金額", amount }] });
function create() {
  const app = backend();
  const token = app.session();
  app.invoke("orders.submit", { requestId: randomUUID(), details: submission() });
  return { app, token, order: app.invoke("admin.list", {}, token).data.orders[0] };
}

test("訂金與餘額按各自月份歸屬，交稿後全額認列且不重複計算", () => {
  const order = fixture("A", 1000, "finalizing", {
    depositAmount: 300,
    depositReceivedOn: "2026-01-31",
    expectedDeliveryOn: "2026-03-01",
  });
  const before = buildRevenueReport([order], 2026);
  assert.deepEqual(before.annual, {
    realized: 0,
    temporary: 30000,
    unfinished: 70000,
    total: 100000,
  });
  assert.equal(before.months[0].temporary, 30000);
  assert.equal(before.months[2].unfinished, 70000);
  order.status = "delivered";
  order.details.revenue.deliveredOn = "2026-04-01";
  const after = buildRevenueReport([order], 2026);
  assert.deepEqual(after.annual, { realized: 100000, temporary: 0, unfinished: 0, total: 100000 });
  assert.equal(after.months[0].total, 0);
  assert.equal(after.months[2].total, 0);
  assert.equal(after.months[3].realized, 100000);
});

test("跨年、分、小數、零元與全年十二個月份精確加總", () => {
  const orders = [
    fixture("A", 0.3, "queued", {
      depositAmount: 0.1,
      depositReceivedOn: "2025-12-31",
      expectedDeliveryOn: "2026-01-01",
    }),
    fixture("B", 0.2, "delivered", { deliveredOn: "2026-02-01" }),
    fixture("C", 0, "delivered", { deliveredOn: "2026-03-01" }),
  ];
  const report = buildRevenueReport(orders, 2026, "2026-01-01T00:00:00Z");
  assert.equal(report.months.length, 12);
  assert.equal(report.annual.total, 40);
  assert.equal(
    report.annual.total,
    report.months.reduce((sum, month) => sum + month.total, 0),
  );
  assert.deepEqual(report.years, [2026, 2025]);
  assert.equal(report.entries.length, 3);
  assert.equal(report.missingQuotes.length, 0);
  assert.equal(buildRevenueReport(orders, 2025).annual.total, 10);
});

test("缺報價不採用預估，缺日期不以建立或修改日期替代；訂金與餘額各自保留", () => {
  const orders = [
    fixture("A", 1000, "delivered"),
    fixture("B", null, "queued"),
    fixture("C", 500, "finalizing", { depositAmount: 200, expectedDeliveryOn: "2026-02-01" }),
  ];
  const report = buildRevenueReport(orders, 2026);
  assert.equal(report.missingQuotes.length, 1);
  assert.equal(report.undated.realized, 100000);
  assert.equal(report.undated.temporary, 20000);
  assert.equal(report.undated.total, 120000);
  assert.equal(report.annual.unfinished, 30000);
});

test("封存與擱置保留金額，各委託類型都計入；只有舊取消單排除", () => {
  const orders = [
    fixture("A", 100, "completed", { deliveredOn: "2026-01-01" }),
    fixture("B", 200, "queued", { expectedDeliveryOn: "2026-01-01" }),
    fixture("C", 300, "cancelled"),
  ];
  orders[0].isArchived = true;
  orders[0].service = "animation";
  orders[1].isOnHold = true;
  orders[1].service = "stickers";
  const report = buildRevenueReport(orders, 2026);
  assert.equal(report.annual.total, 30000);
  assert.equal(report.entries[0].isArchived, true);
  assert.equal(report.excludedCancelled, 1);
});

test("已交稿無日期仍認列累計真實收益，切換年度不遺漏或重複，也不偽造月份", () => {
  const orders = [
    fixture("無日期", 1300, "delivered", { depositAmount: 300 }),
    fixture("舊狀態零元", 0, "completed"),
    fixture("去年", 1400.25, "delivered", { deliveredOn: "2025-12-31" }),
    fixture("今年", 2500, "delivered", { deliveredOn: "2026-01-01" }),
    fixture("未報價", null, "delivered"),
    fixture("未完成", 9999, "queued"),
    fixture("取消", 8888, "cancelled"),
  ];
  orders[0].isArchived = true;
  const before = structuredClone(orders);
  for (const year of [2025, 2026, 2027]) {
    const report = buildRevenueReport(orders, year);
    assert.equal(report.realized.cents, 520025);
    assert.equal(report.realized.entries.length, 4);
    assert.equal(report.realized.entries.find((entry) => entry.orderId === "無日期").date, null);
    assert.equal(report.undated.realized, 130000);
    assert.equal(report.undated.entries.filter((entry) => entry.kind === "realized").length, 2);
    assert.equal(report.undated.temporary, 0);
    assert.equal(report.annual.realized, year === 2025 ? 140025 : year === 2026 ? 250000 : 0);
    assert.equal(
      report.months.reduce((sum, month) => sum + month.realized, 0),
      report.annual.realized,
    );
    assert.equal(report.missingQuotes.length, 1);
  }
  assert.deepEqual(orders, before);
});

test("補填交稿日只改月份歸屬，退回未交稿才移出累計真實收益", () => {
  const order = fixture("歷史單", 1000, "delivered", { depositAmount: 300 });
  assert.equal(buildRevenueReport([order], 2026).realized.cents, 100000);
  order.details.revenue.deliveredOn = "2026-03-01";
  const dated = buildRevenueReport([order], 2026);
  assert.equal(dated.realized.cents, 100000);
  assert.equal(dated.undated.realized, 0);
  assert.equal(dated.months[2].realized, 100000);
  order.status = "finalizing";
  const reopened = buildRevenueReport([order], 2026);
  assert.equal(reopened.realized.cents, 0);
  assert.equal(reopened.undated.temporary, 30000);
  assert.equal(reopened.undated.unfinished, 70000);
});

test("舊交稿日期只取最後一次進入交稿的歷史事件，台灣月底與跨年正確", () => {
  const order = fixture("A", 100, "delivered");
  order.history = [
    { action: "updated", at: "2024-12-31T16:00:00Z", before: { status: "finalizing" } },
    { action: "updated", at: "2025-01-02T00:00:00Z", before: { status: "delivered" } },
    { action: "updated", at: "2025-01-31T16:00:00Z", before: { status: "finalizing" } },
    { action: "updated", at: "2026-01-01T00:00:00Z", before: { status: "delivered" } },
  ];
  assert.equal(deliveredDate(order), "2025-02-01");
  assert.equal(taipeiDate("2025-12-31T16:00:00Z"), "2026-01-01");
  order.details.revenue.deliveredOn = "2024-12-30";
  assert.equal(deliveredDate(order), "2024-12-30");
  order.details.revenue.deliveredOn = null;
  order.history = [{ action: "imported", at: "2026-02-01T00:00:00Z" }];
  assert.equal(deliveredDate(order), null);
});

test("日期、金額與年度邊界拒絕錯誤；允許未確認日期及有效閏日", () => {
  assert.equal(revenueDate("2024-02-29"), "2024-02-29");
  for (const value of [
    "2025-02-29",
    "2026-04-31",
    "2026-1-01",
    "1899-01-01",
    "2026-01-01T00:00:00Z",
    undefined,
  ]) {
    assert.throws(() => revenueDate(value), { code: "VALIDATION" });
  }
  for (const amount of [-1, 0.001, Infinity, "", "1e2", 1001]) {
    assert.throws(() => validateRevenue(revenue({ depositAmount: amount }), { amount: 1000 }), {
      code: "VALIDATION",
    });
  }
  assert.throws(() => validateRevenue(revenue({ depositAmount: 1 }), null), { code: "VALIDATION" });
  assert.throws(() => validateRevenue(revenue({ depositReceivedOn: "2026-01-01" }), null), {
    code: "VALIDATION",
  });
  assert.equal(
    validateRevenue(revenue({ depositAmount: 1000 }), { amount: 1000 }).depositReceivedOn,
    null,
  );
  for (const year of ["2026", 2026.1, null, 1899, 10000])
    assert.throws(() => buildRevenueReport([], year), { code: "VALIDATION" });
  assert.equal(buildRevenueReport([], 2026).annual.total, 0);
});

test("完整預付款只計訂金；損壞的金額資料不能生成看似正確的報表", () => {
  const order = fixture("A", 10, "queued", { depositAmount: 10, depositReceivedOn: "2026-01-01" });
  assert.equal(buildRevenueReport([order], 2026).entries.length, 1);
  order.details.revenue.depositAmount = 11;
  assert.throws(() => buildRevenueReport([order], 2026), { code: "CONFIG" });
  order.details.quote.currency = "USD";
  assert.throws(() => buildRevenueReport([order], 2026), { code: "CONFIG" });
});

test("管理存取與報表需權限，保存收益並保留歷史，公開與收件忽略私有欄位", () => {
  const { app, token, order } = create();
  for (const action of ["admin.revenue", "admin.get"])
    assert.equal(app.invoke(action, { orderId: order.orderId }).error.code, "AUTH");
  const calls = app.calls.length;
  const saved = app.invoke(
    "admin.update",
    {
      ...order,
      quote: quote(1000),
      revenue: revenue({
        depositAmount: 300,
        depositReceivedOn: "2026-01-01",
        expectedDeliveryOn: "2026-03-01",
      }),
    },
    token,
  ).data;
  assert.equal(saved.details.revenue.depositAmount, 300);
  assert.deepEqual(app.invoke("admin.get", { orderId: order.orderId }, token).data, saved);
  const report = app.invoke("admin.revenue", { year: 2026 }, token).data;
  assert.equal(report.annual.total, 100000);
  assert.equal(app.invoke("admin.revenue", { year: "2026" }, token).error.code, "VALIDATION");
  assert.equal(app.invoke("progress.list").data.orders[0].revenue, undefined);
  assert.equal(app.invoke("progress.list").data.orders[0].details, undefined);
  assert.equal(
    validateSubmission(submission({ revenue: saved.details.revenue }), config).revenue,
    undefined,
  );
  assert.equal(app.calls.length, calls);
  assert.equal(app.rows[0].length, 32);
});

test("拖曳與舊頁保留收款；偽造 details.revenue 不能寫入；降報價及清除金額不可少於訂金", () => {
  const { app, token, order } = create();
  const saved = app.invoke(
    "admin.update",
    {
      ...order,
      quote: quote(1000),
      revenue: revenue({
        depositAmount: 300,
        depositReceivedOn: "2026-01-01",
        expectedDeliveryOn: "2026-03-01",
      }),
    },
    token,
  ).data;
  const moved = app.invoke("admin.update", statusUpdate(saved, "finalizing"), token).data;
  assert.deepEqual(moved.details.revenue, saved.details.revenue);
  const old = app.invoke(
    "admin.update",
    { ...moved, details: { ...moved.details, revenue: revenue({ depositAmount: 0 }) } },
    token,
  ).data;
  assert.deepEqual(old.details.revenue, saved.details.revenue);
  assert.deepEqual(old.history.at(-1).before.details.revenue, saved.details.revenue);
  for (const value of [quote(200), null])
    assert.equal(
      app.invoke("admin.update", { ...old, quote: value }, token).error.code,
      "VALIDATION",
    );
  const cleared = app.invoke("admin.update", { ...old, quote: null, revenue: revenue() }, token);
  assert.equal(cleared.ok, true);
  assert.equal(app.invoke("admin.revenue", { year: 2026 }, token).data.missingQuotes.length, 1);
});

test("拖曳與編輯狀態即使沒有金額或收益欄位，也會儲存台灣當天交稿日", () => {
  for (const viaEditor of [false, true]) {
    const { app, token, order } = create();
    const payload = statusUpdate(order, "delivered");
    if (viaEditor) payload.revenue = revenue();
    const response = app.invoke("admin.update", payload, token);
    assert.equal(response.ok, true);
    const saved = app.invoke("admin.get", { orderId: order.orderId }, token).data;
    assert.equal(saved.details.revenue.deliveredOn, taipeiDate(saved.updatedAt));
    assert.equal(saved.status, "delivered");
    assert.equal(saved.revision, order.revision + 1);
    assert.equal(saved.history.at(-1).before.status, order.status);
    const retry = app.invoke("admin.update", payload, token);
    assert.equal(retry.error.code, "CONFLICT");
    assert.equal(
      app.invoke("admin.get", { orderId: order.orderId }, token).data.revision,
      saved.revision,
    );
  }
});

function editorFixture(order) {
  const fields = Object.fromEntries(
    ["status", "depositAmount", "depositReceivedOn", "expectedDeliveryOn", "deliveredOn"].map(
      (name) => [name, Object.assign(new EventTarget(), { value: "", disabled: false })],
    ),
  );
  fields.status.value = order.status;
  const editor = setupRevenueEditor({ elements: fields });
  editor.fill(order);
  return {
    editor,
    fields,
    change(status) {
      fields.status.value = status;
      fields.status.dispatchEvent(new Event("change"));
    },
  };
}

test("切換已交稿立即顯示台灣今天，可手動修正，退回再交稿更新日期", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-09-30T16:15:00Z") });
  const { editor, fields, change } = editorFixture(fixture("編輯範例", 1000, "finalizing"));
  assert.equal(fields.deliveredOn.disabled, true);
  change("delivered");
  assert.equal(fields.deliveredOn.disabled, false);
  assert.equal(editor.collect().deliveredOn, "2026-10-01");
  fields.deliveredOn.value = "2026-09-29";
  assert.equal(editor.collect().deliveredOn, "2026-09-29");
  change("finalizing");
  assert.equal(fields.deliveredOn.value, "");
  assert.equal(editor.collect().deliveredOn, null);
  t.mock.timers.setTime(Date.parse("2026-10-01T16:15:00Z"));
  change("delivered");
  assert.equal(editor.collect().deliveredOn, "2026-10-02");
});

test("開啟歷史已交稿訂單保留舊日期或空白，清除編輯器不留下日期", () => {
  for (const deliveredOn of [null, "2025-03-04"]) {
    const { editor, fields } = editorFixture(
      fixture("歷史範例", 1000, "delivered", { deliveredOn }),
    );
    assert.equal(fields.deliveredOn.disabled, false);
    assert.equal(editor.collect().deliveredOn, deliveredOn);
    editor.clear();
    assert.equal(fields.deliveredOn.value, "");
  }
});

test("交稿自動記日期、保留訂金歷史，退回製作再交稿不沿用上次日期", () => {
  const { app, token, order } = create();
  const saved = app.invoke(
    "admin.update",
    {
      ...order,
      quote: quote(1000),
      revenue: revenue({
        depositAmount: 300,
        depositReceivedOn: "2025-01-01",
        expectedDeliveryOn: "2025-03-01",
      }),
    },
    token,
  ).data;
  const delivered = app.invoke(
    "admin.update",
    {
      ...saved,
      status: "delivered",
      revenue: revenue({ ...saved.details.revenue, deliveredOn: "2025-04-01" }),
    },
    token,
  ).data;
  assert.equal(app.invoke("admin.revenue", { year: 2025 }, token).data.annual.realized, 100000);
  assert.equal(delivered.history.at(-1).before.details.revenue.deliveredOn, null);
  const reopened = app.invoke("admin.update", statusUpdate(delivered, "finalizing"), token).data;
  assert.equal(reopened.details.revenue.deliveredOn, null);
  assert.equal(reopened.details.revenue.depositAmount, 300);
  const done = app.invoke("admin.update", statusUpdate(reopened, "delivered"), token).data;
  assert.equal(done.details.revenue.deliveredOn, taipeiDate(done.updatedAt));
  assert.equal(done.history.at(-1).before.details.revenue.deliveredOn, null);
  const edited = app.invoke("admin.update", { ...done, adminNote: "補充備註" }, token).data;
  assert.equal(edited.details.revenue.deliveredOn, done.details.revenue.deliveredOn);
});

test("報表一次涵蓋超過看板一頁的完整資料，不受已交稿載入限制", () => {
  const app = backend();
  const token = app.session();
  for (let index = 0; index < 31; index++) {
    const result = app.invoke("orders.submit", {
      requestId: randomUUID(),
      details: submission({
        contact: { channel: "telegram", value: `@fictional_revenue_${index}` },
      }),
    });
    assert.equal(result.ok, true);
  }
  const all = app.context.readOrders_(app.context.orderSheet_());
  for (const row of all) {
    const order = app.context.adminOrder_(row);
    assert.equal(
      app.invoke(
        "admin.update",
        {
          ...order,
          status: "delivered",
          quote: quote(1),
          revenue: revenue({ deliveredOn: "2026-01-01" }),
        },
        token,
      ).ok,
      true,
    );
  }
  const writes = app.writes.length;
  const report = app.invoke("admin.revenue", { year: 2026 }, token).data;
  assert.equal(report.orderCount, 31);
  assert.equal(report.annual.realized, 3100);
  assert.equal(report.realized.cents, 3100);
  assert.equal(report.realized.entries.length, 31);
  assert.equal(app.invoke("admin.list", { delivery: "active" }, token).data.orders.length, 0);
  assert.equal(app.writes.length, writes);
});
