import { deliveredDate } from "./revenue.js";

export function setupRevenueEditor(form) {
  const fields = form.elements;
  function sync() {
    fields.deliveredOn.disabled = fields.status.value !== "delivered";
  }
  fields.status.addEventListener("change", sync);
  return {
    fill(order) {
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
      for (const key of ["depositAmount", "depositReceivedOn", "expectedDeliveryOn", "deliveredOn"]) fields[key].value = "";
    },
  };
}
