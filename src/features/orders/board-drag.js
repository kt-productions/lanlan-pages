import { ORDER_STATUSES, orderWorkflow } from "./contract.js";

/** 拖曳沿用管理更新契約，保留需求、旗標與備註，仍由後端核對版本。 */
export function statusUpdate(order, status) {
  if (!Object.hasOwn(ORDER_STATUSES, status)) throw new Error("委託狀態不正確。");
  return {
    orderId: order.orderId,
    revision: order.revision,
    details: structuredClone(order.details),
    ...orderWorkflow(order),
    status,
    publicNote: order.publicNote,
    adminNote: order.adminNote,
  };
}

/** 只接受目前看板內開始的拖曳；外部文字或檔案不能觸發管理修改。 */
export function setupBoardDrag(board, { canDrag, onMove }) {
  let active = null;
  let target = null;
  let point = null;
  let frame = 0;
  let suppressClick = false;

  // 原生拖曳結束可能接著送出 click；只放行下一次新的按下，避免誤開編輯視窗。
  board.addEventListener(
    "pointerdown",
    () => {
      if (!active) suppressClick = false;
    },
    true,
  );
  board.addEventListener(
    "click",
    (event) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    },
    true,
  );

  function reset() {
    active?.classList.remove("is-dragging");
    target?.classList.remove("is-drop-target");
    board.classList.remove("is-dragging");
    active = target = point = null;
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function scroll() {
    if (!active || !point) return;
    // 跨越畫面外的欄位或長清單時，靠近邊緣即可連續捲動。
    const speed = (position, start, end) =>
      position < start + 48 ? -10 : position > end - 48 ? 10 : 0;
    const bounds = board.getBoundingClientRect();
    board.scrollLeft += speed(point.x, bounds.left, bounds.right);
    const column = document.elementFromPoint(point.x, point.y)?.closest(".board-column");
    const cards = column && board.contains(column) ? column.querySelector(".column-cards") : null;
    if (cards) {
      const box = cards.getBoundingClientRect();
      cards.scrollTop += speed(point.y, box.top, box.bottom);
    }
    frame = requestAnimationFrame(scroll);
  }

  board.addEventListener("dragstart", (event) => {
    const card = event.target.closest("[data-drag-order-id]");
    if (!card || !canDrag() || event.target.closest("button,a,input,select,textarea")) {
      event.preventDefault();
      return;
    }
    active = card;
    suppressClick = true;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.dataset.dragOrderId);
    card.classList.add("is-dragging");
    board.classList.add("is-dragging");
  });

  board.addEventListener("dragover", (event) => {
    if (!active || !canDrag()) return;
    event.preventDefault();
    point = { x: event.clientX, y: event.clientY };
    if (!frame) frame = requestAnimationFrame(scroll);
    const column = event.target.closest(".board-column");
    target?.classList.remove("is-drop-target");
    target = column && board.contains(column) && !column.contains(active) ? column : null;
    target?.classList.add("is-drop-target");
    event.dataTransfer.dropEffect = target ? "move" : "none";
  });

  board.addEventListener("dragleave", (event) => {
    if (!board.contains(event.relatedTarget)) {
      target?.classList.remove("is-drop-target");
      target = point = null;
      cancelAnimationFrame(frame);
      frame = 0;
    }
  });

  board.addEventListener("drop", (event) => {
    if (!active) return;
    event.preventDefault();
    const column = event.target.closest(".board-column");
    const id = active.dataset.dragOrderId;
    const status = column?.dataset.status;
    const valid =
      canDrag() &&
      column &&
      board.contains(column) &&
      !column.contains(active) &&
      Object.hasOwn(ORDER_STATUSES, status);
    reset();
    if (valid) void onMove(id, status);
  });
  board.addEventListener("dragend", reset);
  return { reset };
}
