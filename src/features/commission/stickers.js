// 分頁只隱藏顯示，不停用款式，確保跨頁選擇仍參與 FormData 與全選狀態。
export function setupStickers(config, form, onChange) {
  const selectAllStickers = document.querySelector("#sticker-select-all");
  const stickerDiscounts = config.services.stickers.pricing.quantityDiscounts;
  const formatMoney = (value) => new Intl.NumberFormat("zh-TW").format(value);
  function selectedStickers() {
    return [...form.querySelectorAll('input[name="stickerIds"]:checked')].map((input) =>
      config.stickerOptions.find((item) => item.number === Number(input.value)),
    );
  }
  function updateStickerSummary() {
    const selected = selectedStickers();
    const total = selected.reduce((sum, item) => sum + item.price, 0);
    document.querySelector("#sticker-selection").textContent =
      "已選 " + selected.length + " 款・原價小計 NT$" + formatMoney(total);
    selectAllStickers.checked = selected.length === config.stickerOptions.length;
    selectAllStickers.indeterminate =
      selected.length > 0 && selected.length < config.stickerOptions.length;
    const tier = stickerDiscounts.filter((item) => selected.length >= item.count).at(-1);
    document.querySelector("#sticker-discount-summary").textContent = tier
      ? `已達滿 ${tier.count} 張，數量折扣 ${formatMoney(tier.amount)} 元。`
      : `未滿 ${stickerDiscounts[0].count} 張，尚未適用數量折扣。`;
    for (const item of document.querySelectorAll("#sticker-discount-tiers li")) {
      if (Number(item.dataset.count) === tier?.count) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
    }
  }
  const stickerHost = document.querySelector("#sticker-options");
  for (const tier of stickerDiscounts) {
    const item = document.createElement("li");
    item.dataset.count = String(tier.count);
    item.textContent = `滿 ${tier.count} 張折 ${formatMoney(tier.amount)}`;
    document.querySelector("#sticker-discount-tiers").append(item);
  }
  for (const item of config.stickerOptions) {
    const label = document.createElement("label");
    label.className = "sticker-choice";
    label.dataset.page = String(Math.floor(config.stickerOptions.indexOf(item) / 16));
    label.hidden = label.dataset.page !== "0";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "stickerIds";
    input.value = String(item.number);
    input.setAttribute("aria-label", "貼圖 No." + item.number + "，NT$" + item.price);
    const img = document.createElement("img");
    img.src = "../" + item.image;
    img.alt = "貼圖 No." + item.number + " 原始示例";
    img.width = 260;
    img.height = 260;
    img.loading = "lazy";
    const caption = document.createElement("span");
    caption.textContent = "No." + item.number + " · $" + item.price;
    label.append(input, img, caption);
    stickerHost.append(label);
  }
  selectAllStickers.addEventListener("change", () => {
    for (const input of stickerHost.querySelectorAll('input[name="stickerIds"]'))
      input.checked = selectAllStickers.checked;
    onChange();
  });
  for (const button of document.querySelectorAll("[data-sticker-page]")) {
    button.addEventListener("click", () => {
      for (const option of stickerHost.children)
        option.hidden = option.dataset.page !== button.dataset.stickerPage;
      for (const peer of document.querySelectorAll("[data-sticker-page]"))
        peer.setAttribute("aria-pressed", String(peer === button));
    });
  }

  return { selected: selectedStickers, updateSummary: updateStickerSummary };
}
