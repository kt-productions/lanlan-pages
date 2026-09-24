import { deliveredDate } from "./revenue.js";
import { workflowDateDefaults } from "./workflow-dates.js";

export function setupRevenueEditor(form) {
  const fields = form.elements;
  let currentOrder;
  let previousStatus;
  function sync() {
    fields.deliveredOn.disabled = fields.status.value !== "delivered";
  }
  fields.status.addEventListener("change", () => {
    if (!currentOrder) return;
    const details = { ...currentOrder.details };
    if (!currentOrder.source && currentOrder.service === "stickers" && fields.stickerIds)
      details.stickerIds = fields.stickerIds.value
        .split(/[,，、\s]+/)
        .filter(Boolean)
        .map(Number);
    const dates = workflowDateDefaults(
      { ...currentOrder, details, status: previousStatus },
      fields.status.value,
    );
    // 載入歷史資料只顯示原值；使用者切換階段才預填，仍可在儲存前手動調整。
    for (const [key, value] of Object.entries(dates)) fields[key].value = value || "";
    if (fields.status.value !== "delivered") fields.deliveredOn.value = "";
    previousStatus = fields.status.value;
    sync();
  });
  return {
    fill(order) {
      currentOrder = order;
      previousStatus = fields.status.value;
      const revenue = order.details.revenue || {};
      fields.depositAmount.value = revenue.depositAmount ?? 0;
      fields.depositReceivedOn.value = revenue.depositReceivedOn || "";
      fields.expectedDeliveryOn.value = revenue.expectedDeliveryOn || "";
      fields.deliveredOn.value = order.status === "delivered" ? deliveredDate(order) || "" : "";
      sync();
    },
    collect() {
      return {
        depositAmount: fields.depositAmount.value,
        depositReceivedOn: fields.depositReceivedOn.value || null,
        expectedDeliveryOn: fields.expectedDeliveryOn.value || null,
        deliveredOn: fields.status.value === "delivered" ? fields.deliveredOn.value || null : null,
      };
    },
    clear() {
      currentOrder = null;
      previousStatus = null;
      for (const key of ["depositAmount", "depositReceivedOn", "expectedDeliveryOn", "deliveredOn"])
        fields[key].value = "";
    },
  };
}
