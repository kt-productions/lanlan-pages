// 保留建置時的完整作品清單；只有 JavaScript 成功初始化後才套用分批顯示。
export function setupGallery(works, onChange) {
  const cards = [...document.querySelectorAll(".artwork")];
  const filters = [...document.querySelectorAll("[data-filter]")];
  const more = document.querySelector("#load-more");
  const count = document.querySelector("#gallery-count");
  const batchSize = 6;
  let activeFilter = "all";
  let visibleLimit = batchSize;
  let filteredWorks = works;

  function applyFilter(focusNew = false) {
    const oldLimit = visibleLimit - batchSize;
    filteredWorks = works.filter(
      (work) => activeFilter === "all" || work.category === activeFilter,
    );
    const visibleIds = new Set(
      filteredWorks.slice(0, visibleLimit).map((work) => work.id),
    );
    for (const card of cards) card.hidden = !visibleIds.has(card.dataset.id);
    more.hidden = filteredWorks.length <= visibleLimit;
    count.textContent = `已顯示 ${Math.min(visibleLimit, filteredWorks.length)} / ${filteredWorks.length} 件作品`;
    onChange();
    if (focusNew) {
      const card = cards.find(
        (item) => item.dataset.id === filteredWorks[oldLimit]?.id,
      );
      card?.querySelector("a").focus({ preventScroll: true });
    }
  }
  for (const filter of filters) {
    filter.addEventListener("click", () => {
      activeFilter = filter.dataset.filter;
      visibleLimit = batchSize;
      for (const button of filters)
        button.setAttribute("aria-pressed", String(button === filter));
      applyFilter();
    });
  }
  more.addEventListener("click", () => {
    visibleLimit += batchSize;
    applyFilter(true);
  });
  applyFilter();

  document.querySelector(".filters").hidden = false;
  return { getWorks: () => filteredWorks };
}
