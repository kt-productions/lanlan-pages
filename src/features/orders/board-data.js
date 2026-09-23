/** 只讀取指定交稿範圍，完成該範圍所有分頁後才更新看板。 */
export async function loadBoardOrders(api, {
  admin = false, token = "", delivery = "active", onProgress = () => {},
} = {}) {
  const orders = new Map();
  let offset = 0;
  let total;
  do {
    const page = await api(admin ? "admin.list" : "progress.list", {
      offset, delivery, ...(!admin ? { limit: 200 } : {}),
    }, token);
    if (total !== undefined && total !== page.total) {
      throw new Error("委託清單在讀取時有變動，請重新載入。");
    }
    total = page.total;
    for (const order of page.orders) {
      if ((delivery === "active" && order.status === "delivered") ||
          (delivery === "delivered" && order.status !== "delivered")) {
        throw new Error("委託載入範圍不正確，請重新載入。");
      }
      orders.set(order.orderId, order);
    }
    onProgress(orders.size, total);
    const next = page.nextOffset;
    if (next !== null && (!Number.isInteger(next) || next <= offset)) {
      throw new Error("委託分頁回應不正確，請重新載入。");
    }
    offset = next;
  } while (offset !== null);
  if (orders.size !== total) throw new Error("委託清單不完整，請重新載入。");
  return [...orders.values()];
}

/** 補載時以最新回應取代同編號訂單，包含從未交稿移到已交稿的情況。 */
export function mergeDeliveredOrders(current, delivered) {
  return [...new Map([
    ...current.filter((order) => order.status !== "delivered"),
    ...delivered,
  ].map((order) => [order.orderId, order])).values()];
}
