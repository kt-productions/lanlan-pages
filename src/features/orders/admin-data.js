/** 管理 API 保留每頁 30 筆；完成全部分頁後才更新看板，避免把未載入資料誤示為空。 */
export async function loadAdminOrders(api, token, onProgress = () => {}) {
  const orders = new Map();
  let offset = 0;
  let total;
  do {
    const page = await api("admin.list", { offset }, token);
    if (total !== undefined && total !== page.total) {
      throw new Error("委託清單在讀取時有變動，請重新載入。");
    }
    total = page.total;
    for (const order of page.orders) orders.set(order.orderId, order);
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
