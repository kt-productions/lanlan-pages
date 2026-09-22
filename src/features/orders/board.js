import { ORDER_STATUSES } from "./contract.js";

/** 僅對已完整載入的公開快照使用；不把部分分頁誤當完整看板。 */
export function filterBoard(snapshot, { service = "", status = "", flag = "" }) {
  const orders = snapshot.filter((order) =>
    (!service || order.service === service) && (!status || order.status === status) &&
    (!flag || (flag === "rush" ? order.isRush : order.isOnHold)));
  const stageCounts = Object.fromEntries(Object.keys(ORDER_STATUSES).map(key => [key, 0]));
  for (const order of orders) stageCounts[order.status] += 1;
  return { orders, stageCounts, total: orders.length, nextOffset: null };
}
