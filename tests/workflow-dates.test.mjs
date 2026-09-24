import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { addWorkingDays, workflowDateDefaults } from "../src/features/orders/workflow-dates.js";
import { setupRevenueEditor } from "../src/features/orders/revenue-editor.js";
import { statusUpdate } from "../src/features/orders/board-drag.js";
import { taipeiDate } from "../src/features/orders/contract.js";
import { backend, submission } from "./helpers/apps-script.mjs";

const now = "2026-09-24T09:00:00Z";
const order = (service = "chibi", status = "queued", count = 12) => ({
  service,
  status,
  details: { stickerIds: Array.from({ length: count }, (_, index) => index + 1) },
});

test("工作天從隔天起算，只跳過週末，跨月、跨年及週末起算正確", () => {
  assert.equal(addWorkingDays("2026-09-24", 3), "2026-09-29");
  assert.equal(addWorkingDays("2026-09-25", 3), "2026-09-30");
  assert.equal(addWorkingDays("2026-09-26", 3), "2026-09-30");
  assert.equal(addWorkingDays("2026-09-27", 3), "2026-09-30");
  assert.equal(addWorkingDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addWorkingDays("2026-12-31", 3), "2027-01-05");
  assert.equal(
    workflowDateDefaults(order(), "drafting", "2026-09-24T16:01:00Z").expectedDeliveryOn,
    "2026-09-30",
  );
});

test("開始製作依類型與貼圖張數計算，未滿十二張進位且不重複計數", () => {
  assert.deepEqual(workflowDateDefaults(order("animation"), "drafting", now), {
    expectedDeliveryOn: "2026-10-05",
  });
  assert.deepEqual(workflowDateDefaults(order(), "drafting", now), {
    expectedDeliveryOn: "2026-09-29",
  });
  for (const [count, days] of [
    [1, 3],
    [12, 3],
    [13, 6],
    [24, 6],
    [25, 9],
    [48, 12],
  ]) {
    assert.equal(
      workflowDateDefaults(order("stickers", "queued", count), "drafting", now).expectedDeliveryOn,
      addWorkingDays("2026-09-24", days),
    );
  }
  const duplicate = order("stickers");
  duplicate.details.stickerIds.push(12);
  assert.equal(workflowDateDefaults(duplicate, "drafting", now).expectedDeliveryOn, "2026-09-29");
  for (const stickerIds of [null, [], [NaN]]) {
    const unknown = order("stickers");
    unknown.details.stickerIds = stickerIds;
    assert.deepEqual(workflowDateDefaults(unknown, "drafting", now), {});
  }
});

test("只有指定階段轉換記錄日期，不重設同階段、退回或其他跳階的日期", () => {
  for (const status of ["drafting", "draft_review", "awaiting_payment"]) {
    assert.deepEqual(workflowDateDefaults(order("chibi", status), "finalizing", now), {
      depositReceivedOn: "2026-09-24",
    });
  }
  for (const [before, after] of [
    ["queued", "finalizing"],
    ["finalizing", "finalizing"],
    ["draft_review", "drafting"],
    ["finalizing", "drafting"],
  ])
    assert.deepEqual(workflowDateDefaults(order("chibi", before), after, now), {});
  assert.deepEqual(workflowDateDefaults(order(), "delivered", now), { deliveredOn: "2026-09-24" });
  assert.deepEqual(workflowDateDefaults(order("chibi", "delivered"), "drafting", now), {
    deliveredOn: null,
  });
});

function create(service, count = 12) {
  const app = backend();
  const token = app.session();
  const details = submission({
    service,
    chibiPlan: "animated",
    stickerIds: Array.from({ length: count }, (_, index) => index + 1),
  });
  assert.equal(app.invoke("orders.submit", { requestId: randomUUID(), details }).ok, true);
  return { app, token, current: app.invoke("admin.list", {}, token).data.orders[0] };
}

test("拖曳開始製作及收訂金的日期與狀態一次保存，沒有金額也可重新編輯", () => {
  for (const [service, count, days] of [
    ["animation", 0, 7],
    ["chibi", 0, 3],
    ["stickers", 13, 6],
  ]) {
    const { app, token, current } = create(service, count);
    const begun = app.invoke("admin.update", statusUpdate(current, "drafting"), token).data;
    assert.equal(
      begun.details.revenue.expectedDeliveryOn,
      addWorkingDays(taipeiDate(begun.updatedAt), days),
    );
    const paid = app.invoke("admin.update", statusUpdate(begun, "finalizing"), token).data;
    assert.equal(paid.details.revenue.depositReceivedOn, taipeiDate(paid.updatedAt));
    assert.equal(paid.details.revenue.depositAmount, 0);
    assert.equal(paid.details.revenue.expectedDeliveryOn, begun.details.revenue.expectedDeliveryOn);
    assert.equal(paid.history.at(-1).before.details.revenue.depositReceivedOn, null);
    const saved = app.invoke(
      "admin.update",
      { ...paid, revenue: paid.details.revenue, adminNote: "稍後補訂金金額" },
      token,
    );
    assert.equal(saved.ok, true);
    assert.deepEqual(saved.data.details.revenue, paid.details.revenue);
    assert.equal(app.invoke("admin.revenue", { year: 2026 }, token).data.realized.cents, 0);
  }
});

test("編輯可明確修正自動日期，收款日不推定訂金金額，重複儲存仍受版本保護", () => {
  const { app, token, current } = create("chibi");
  const defaults = {
    depositAmount: 0,
    depositReceivedOn: null,
    expectedDeliveryOn: "2027-01-04",
    deliveredOn: null,
  };
  const begun = app.invoke(
    "admin.update",
    { ...statusUpdate(current, "drafting"), revenue: defaults },
    token,
  ).data;
  assert.equal(begun.details.revenue.expectedDeliveryOn, "2027-01-04");
  const reviewed = app.invoke("admin.update", statusUpdate(begun, "draft_review"), token).data;
  const payload = {
    ...statusUpdate(reviewed, "finalizing"),
    revenue: { ...defaults, depositReceivedOn: "2026-09-01" },
  };
  const paid = app.invoke("admin.update", payload, token).data;
  assert.equal(paid.details.revenue.depositReceivedOn, "2026-09-01");
  assert.equal(paid.details.revenue.depositAmount, 0);
  assert.equal(app.invoke("admin.update", payload, token).error.code, "CONFLICT");
});

test("前端依目前貼圖張數預填工期及訂金日期，開啟或重填編輯器不自動更動", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(now) });
  const fields = Object.fromEntries(
    [
      "status",
      "depositAmount",
      "depositReceivedOn",
      "expectedDeliveryOn",
      "deliveredOn",
      "stickerIds",
    ].map((name) => [name, Object.assign(new EventTarget(), { value: "", disabled: false })]),
  );
  fields.status.value = "queued";
  const editor = setupRevenueEditor({ elements: fields });
  editor.fill(order("stickers"));
  fields.stickerIds.value = Array.from({ length: 13 }, (_, index) => index + 1).join(",");
  const change = (status) => {
    fields.status.value = status;
    fields.status.dispatchEvent(new Event("change"));
  };
  assert.equal(editor.collect().expectedDeliveryOn, null);
  change("drafting");
  assert.equal(editor.collect().expectedDeliveryOn, "2026-10-02");
  change("draft_review");
  change("finalizing");
  assert.equal(editor.collect().depositReceivedOn, "2026-09-24");
  assert.equal(editor.collect().depositAmount, 0);
  assert.equal(editor.collect().expectedDeliveryOn, "2026-10-02");
  fields.depositReceivedOn.value = "2026-09-23";
  assert.equal(editor.collect().depositReceivedOn, "2026-09-23");
  // 歷史單會隱藏表單內容，不能沿用上一張正常貼圖訂單殘留的數量欄位。
  fields.status.value = "queued";
  editor.fill({
    ...order("stickers"),
    source: { provider: "trello" },
    details: { stickerIds: null },
  });
  change("drafting");
  assert.equal(editor.collect().expectedDeliveryOn, null);
});
