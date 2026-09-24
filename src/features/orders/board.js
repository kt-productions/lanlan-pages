import { ORDER_STATUSES, orderWorkflow, compareOrderAge } from "./contract.js";

/** 僅對已完整載入的快照使用；不把部分分頁誤當完整看板。 */
export function filterBoard(snapshot, { service = "", status = "", flag = "", search = "" }) {
  const needle = search.trim().toLowerCase();
  const orders = snapshot
    .map((order) => ({ ...order, ...orderWorkflow(order) }))
    .filter(
      (order) =>
        orderWorkflow(order).isArchived === (flag === "archived") &&
        (!service || order.service === service) &&
        (!status || order.status === status) &&
        (!flag || flag === "archived" || (flag === "rush" ? order.isRush : order.isOnHold)) &&
        (!needle ||
          `${order.orderId} ${order.details?.nickname || order.displayTitle || ""}`
            .toLowerCase()
            .includes(needle)),
    )
    .sort(compareOrderAge);
  const stageCounts = Object.fromEntries(Object.keys(ORDER_STATUSES).map((key) => [key, 0]));
  for (const order of orders) stageCounts[order.status] += 1;
  return { orders, stageCounts, total: orders.length, nextOffset: null };
}
