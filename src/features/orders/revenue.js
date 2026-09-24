import {
  orderWorkflow,
  orderSource,
  quoteCents,
  revenueDate,
  taipeiDate,
  requireValue,
} from "./contract.js";

export const REVENUE_KINDS = {
  realized: "真實收益",
  temporary: "暫時收益（訂金）",
  unfinished: "未完成收益（餘額）",
};

/** 舊資料只從可證明的進入已交稿事件補日期，不能用最後修改日或 Trello 最後活動日。 */
export function deliveredDate(order) {
  const details = order.details || JSON.parse(order.detailsJson || "{}");
  if (details.revenue?.deliveredOn) return revenueDate(details.revenue.deliveredOn);
  if (orderWorkflow(order).status !== "delivered") return null;
  const history = order.history || JSON.parse(order.historyJson || "[]");
  for (const event of history.slice().reverse()) {
    if (event.action !== "updated" || !event.before?.status) continue;
    if (orderWorkflow(event.before).status !== "delivered") return taipeiDate(event.at);
  }
  return null;
}

function totals() {
  return { realized: 0, temporary: 0, unfinished: 0, total: 0 };
}

/** 報表是目前訂單狀態的快照；三類互斥，以整數分累加，不是歷史現金流水帳。 */
export function buildRevenueReport(orders, year, now = new Date().toISOString()) {
  requireValue(Number.isInteger(year) && year >= 1900 && year <= 9999, "請選擇有效年度。");
  const entries = [];
  const missingQuotes = [];
  let excludedCancelled = 0;
  for (const order of orders) {
    if (order.status === "cancelled") {
      excludedCancelled++;
      continue;
    }
    const details = order.details || JSON.parse(order.detailsJson || "{}");
    const flow = orderWorkflow(order);
    const identity = {
      orderId: order.orderId,
      title: orderSource(order)?.cardName || details.nickname || order.orderId,
      service: order.service,
      isArchived: flow.isArchived,
    };
    if (!details.quote) {
      missingQuotes.push(identity);
      continue;
    }
    requireValue(details.quote.currency === "TWD", "訂單金額含有不支援的幣別。", "CONFIG");
    const amount = quoteCents(details.quote.amount);
    const revenue = details.revenue || {};
    const add = (kind, cents, date) => entries.push({ ...identity, kind, cents, date });
    if (flow.status === "delivered") {
      add("realized", amount, deliveredDate(order));
    } else {
      const deposit = quoteCents(revenue.depositAmount ?? 0);
      requireValue(deposit <= amount, "訂單訂金超過總額，請先修正收益資料。", "CONFIG");
      if (deposit) add("temporary", deposit, revenueDate(revenue.depositReceivedOn ?? null));
      if (amount > deposit || amount === 0) {
        add("unfinished", amount - deposit, revenueDate(revenue.expectedDeliveryOn ?? null));
      }
    }
  }
  const years = [
    ...new Set([
      year,
      Number(taipeiDate(now).slice(0, 4)),
      ...entries.filter((entry) => entry.date).map((entry) => Number(entry.date.slice(0, 4))),
    ]),
  ].sort((a, b) => b - a);
  const months = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, ...totals() }));
  const annual = totals();
  const undated = { ...totals(), entries: [] };
  const selected = [];
  for (const entry of entries) {
    if (!entry.date) {
      undated[entry.kind] += entry.cents;
      undated.total += entry.cents;
      undated.entries.push(entry);
    } else if (Number(entry.date.slice(0, 4)) === year) {
      const month = months[Number(entry.date.slice(5, 7)) - 1];
      month[entry.kind] += entry.cents;
      month.total += entry.cents;
      annual[entry.kind] += entry.cents;
      annual.total += entry.cents;
      selected.push(entry);
    }
  }
  selected.sort((a, b) => a.date.localeCompare(b.date) || a.orderId.localeCompare(b.orderId));
  return {
    year,
    years,
    currency: "TWD",
    generatedAt: now,
    months,
    annual,
    entries: selected,
    undated,
    missingQuotes,
    excludedCancelled,
    orderCount: orders.length,
  };
}
