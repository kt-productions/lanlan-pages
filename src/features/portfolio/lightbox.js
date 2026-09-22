// 檢視器使用目前分類的完整清單，首尾不循環；原始媒體連結仍支援另開分頁與無腳本瀏覽。
export function setupLightbox(getWorks, motion) {
  const labels = { animation: "角色動畫", chibi: "小動圖", stickers: "貼圖" };
  const dialog = document.querySelector("#lightbox");
  const mediaHost = document.querySelector("#lightbox-media");
  const mediaError = document.querySelector("#media-error");
  let selectedIndex = 0;
  let trigger = null;
  let dialogWasPlaying = false;

  function clearMedia() {
    const oldVideo = mediaHost.querySelector("video");
    if (oldVideo) {
      oldVideo.pause();
      oldVideo.removeAttribute("src");
      oldVideo.load();
    }
    dialogWasPlaying = false;
    mediaHost.replaceChildren();
  }
  function playDialog(video) {
    void video.play().catch((error) => {
      if (!video.isConnected || !dialog.open) return;
      if (error.name === "NotAllowedError") {
        mediaError.textContent = "瀏覽器限制自動播放，請使用影片的播放鍵。";
        mediaError.hidden = false;
      } else if (error.name !== "AbortError") {
        mediaError.textContent = "影片無法播放，請使用播放鍵重試或稍後再試。";
        mediaError.hidden = false;
      }
    });
  }
  function renderWork() {
    const work = getWorks()[selectedIndex];
    clearMedia();
    mediaError.hidden = true;
    document.querySelector("#lightbox-title").textContent = work.title;
    document.querySelector("#lightbox-category").textContent =
      labels[work.category];
    document.querySelector("#lightbox-count").textContent =
      `${selectedIndex + 1} / ${getWorks().length}`;
    const media = document.createElement(
      work.type === "video" ? "video" : "img",
    );
    if (work.type === "video") {
      media.controls = true;
      media.playsInline = true;
      media.loop = true;
      media.muted = true;
      media.defaultMuted = true;
      media.autoplay = motion.isEnabled() && !document.hidden;
      media.preload = motion.isEnabled() ? "metadata" : "none";
      media.poster = "./" + work.poster;
      media.setAttribute("aria-label", work.title);
    } else {
      media.alt = work.alt || work.title;
    }
    media.addEventListener("error", () => {
      mediaError.textContent = "作品暫時無法播放，請稍後重試。";
      mediaError.hidden = false;
    });
    media.src = "./" + (work.playbackSrc || work.src);
    mediaHost.append(media);
    if (work.type === "video" && motion.isEnabled() && !document.hidden)
      playDialog(media);
    document.querySelector("#previous-work").disabled = selectedIndex === 0;
    document.querySelector("#next-work").disabled =
      selectedIndex === getWorks().length - 1;
  }
  for (const link of document.querySelectorAll("[data-work]")) {
    link.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        return;
      if (typeof dialog.showModal !== "function") return;
      selectedIndex = getWorks().findIndex(
        (work) => work.id === link.dataset.work,
      );
      if (selectedIndex < 0) return;
      event.preventDefault();
      trigger = link;
      dialog.showModal();
      motion.sync();
      renderWork();
      document.body.classList.add("modal-open");
      document.querySelector("#close-lightbox").focus();
    });
  }
  function moveWork(delta) {
    const next = selectedIndex + delta;
    if (next < 0 || next >= getWorks().length) return;
    selectedIndex = next;
    renderWork();
  }
  document
    .querySelector("#previous-work")
    .addEventListener("click", () => moveWork(-1));
  document
    .querySelector("#next-work")
    .addEventListener("click", () => moveWork(1));
  document
    .querySelector("#close-lightbox")
    .addEventListener("click", () => dialog.close());
  document
    .querySelector("#lightbox-form")
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  });
  dialog.addEventListener("close", () => {
    clearMedia();
    document.body.classList.remove("modal-open");
    trigger?.focus({ preventScroll: true });
    motion.sync();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.target.tagName === "VIDEO") return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveWork(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveWork(1);
    }
  });

  document.addEventListener("visibilitychange", () => {
    const video = mediaHost.querySelector("video");
    if (document.hidden) {
      dialogWasPlaying = Boolean(video && !video.paused);
      video?.pause();
    } else if (video && dialogWasPlaying) {
      playDialog(video);
    }
    motion.sync();
  });

  return {
    syncMotion() {
      const video = mediaHost.querySelector("video");
      if (!video) return;
      if (motion.isEnabled() && !document.hidden) playDialog(video);
      else video.pause();
    },
  };
}
