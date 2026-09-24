// 保留建置時的完整作品清單；只有 JavaScript 成功初始化後才套用分批顯示。
export function setupGallery(works, onChange) {
  const cards = [...document.querySelectorAll(".artwork")];
  const filters = [...document.querySelectorAll("[data-filter]")];
  const more = document.querySelector("#load-more");
  const count = document.querySelector("#gallery-count");
  const grid = document.querySelector("#art-grid");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const batchSize = () => (activeFilter === "chibi" ? 8 : 6);
  const animations = new Set();
  let activeFilter = "chibi";
  let visibleLimit = batchSize();
  let filteredWorks = works;
  let revision = 0;

  function animate(element, keyframes, options) {
    const animation = element.animate(keyframes, options);
    animations.add(animation);
    // 快速切換會取消前一輪動畫；取消也要結束等待，讓最新分類接手。
    return animation.finished
      .catch((error) => {
        if (error.name !== "AbortError") throw error;
      })
      .finally(() => {
        animations.delete(animation);
        animation.cancel();
      });
  }

  async function transitionGallery({ replace = false, focusNew = false } = {}) {
    const currentRevision = ++revision;
    const oldHeight = grid.getBoundingClientRect().height;
    const oldOpacity = getComputedStyle(grid).opacity;
    const previousCards = new Set(cards.filter((card) => !card.hidden));
    for (const animation of animations) animation.cancel();
    grid.classList.remove("is-transitioning");
    more.disabled = true;

    if (replace && !reducedMotion.matches && grid.animate) {
      // 高度動畫途中改選時，從畫面當下的高度接續，避免取消動畫造成跳動。
      grid.style.height = `${oldHeight}px`;
      grid.classList.add("is-transitioning");
      await animate(grid, [{ opacity: oldOpacity }, { opacity: 0 }], {
        duration: 130,
        easing: "ease-out",
        fill: "forwards",
      });
      if (currentRevision !== revision) return;
    }

    applyFilter(focusNew);
    grid.style.removeProperty("height");
    if (!reducedMotion.matches && grid.animate) {
      const newHeight = grid.getBoundingClientRect().height;
      const enteringCards = cards.filter(
        (card) => !card.hidden && (replace || !previousCards.has(card)),
      );
      const pending = [];
      if (Math.abs(newHeight - oldHeight) > 1) {
        // 保持作品原有尺寸，只展開容器高度，讓下方按鈕與區段平順移動。
        grid.classList.add("is-transitioning");
        pending.push(
          animate(grid, [{ height: `${oldHeight}px` }, { height: `${newHeight}px` }], {
            duration: 360,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          }),
        );
      }
      enteringCards.forEach((card, index) => {
        pending.push(
          animate(
            card,
            [
              { opacity: 0, transform: "translateY(16px) scale(0.985)" },
              { opacity: 1, transform: "translateY(0) scale(1)" },
            ],
            {
              duration: 340,
              delay: index * 45,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
              fill: "backwards",
            },
          ),
        );
      });
      await Promise.all(pending);
      if (currentRevision !== revision) return;
    }

    grid.classList.remove("is-transitioning");
    more.disabled = false;
    onChange();
  }

  function applyFilter(focusNew = false) {
    const oldLimit = visibleLimit - batchSize();
    grid.dataset.filter = activeFilter;
    filteredWorks = works.filter((work) => work.category === activeFilter);
    const visibleIds = new Set(filteredWorks.slice(0, visibleLimit).map((work) => work.id));
    for (const card of cards) card.hidden = !visibleIds.has(card.dataset.id);
    more.hidden = filteredWorks.length <= visibleLimit;
    count.textContent = `已顯示 ${Math.min(visibleLimit, filteredWorks.length)} / ${filteredWorks.length} 件作品`;
    onChange();
    if (focusNew) {
      const card = cards.find((item) => item.dataset.id === filteredWorks[oldLimit]?.id);
      card?.querySelector("a").focus({ preventScroll: true });
    }
  }
  for (const filter of filters) {
    filter.addEventListener("click", () => {
      if (activeFilter === filter.dataset.filter) return;
      activeFilter = filter.dataset.filter;
      visibleLimit = batchSize();
      for (const button of filters) button.setAttribute("aria-pressed", String(button === filter));
      void transitionGallery({ replace: true });
    });
  }
  more.addEventListener("click", () => {
    visibleLimit += batchSize();
    void transitionGallery({ focusNew: true });
  });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) {
      for (const animation of animations) animation.finish();
    }
  });
  applyFilter();

  document.querySelector(".filters").hidden = false;
  return { getWorks: () => filteredWorks };
}
