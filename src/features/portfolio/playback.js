// 播放許可由可見範圍、使用者選擇、分頁及檢視器共同決定，避免背景影片持續下載或播放。
export function setupPlayback({ isModalOpen, onMotionChange = () => {} }) {
  const backgroundVideos = [...document.querySelectorAll("video[data-autoplay]")];
  const motionButtons = [...document.querySelectorAll("[data-animation-toggle]")];
  const playbackStatus = document.querySelector("#playback-status");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const connection = navigator.connection;
  const inView = new WeakSet();
  const pendingPlayback = new WeakSet();
  const blockedPlayback = new Set();
  let animationsEnabled = !reducedMotion.matches && !connection?.saveData;
  let motionWasChosen = false;

  function isNearViewport(video, margin = 0) {
    if (video.closest("[hidden]")) return false;
    const rect = video.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > -margin &&
      rect.top < innerHeight + margin &&
      rect.right > 0 &&
      rect.left < innerWidth
    );
  }
  function loadPoster(video) {
    if (!video.hasAttribute("poster") && video.dataset.poster) video.poster = video.dataset.poster;
  }
  function isFullyBuffered(video) {
    // readyState=4 只代表預估可順播，不保證整支影片已下載完成。
    return (
      Number.isFinite(video.duration) &&
      video.buffered.length === 1 &&
      video.buffered.start(0) <= 0.05 &&
      video.buffered.end(0) >= video.duration - 0.05
    );
  }

  function wantsBackgroundPlayback(video) {
    return (
      animationsEnabled &&
      !document.hidden &&
      !isModalOpen() &&
      inView.has(video) &&
      isNearViewport(video)
    );
  }
  function updateMotionControls() {
    for (const button of motionButtons) {
      button.hidden = false;
      button.setAttribute("aria-pressed", String(!animationsEnabled));
      button.setAttribute("aria-label", animationsEnabled ? "暫停所有動畫" : "播放所有動畫");
      button.querySelector("span").textContent = animationsEnabled ? "暫停動畫" : "播放動畫";
      button.querySelector("use").setAttribute("href", animationsEnabled ? "#pause" : "#play");
    }
    const blocked = [...blockedPlayback].some(wantsBackgroundPlayback);
    playbackStatus.hidden = !blocked;
    playbackStatus.textContent = blocked
      ? "瀏覽器暫時限制自動播放。請點「播放動畫」啟動，或點選作品放大播放。"
      : "";
    if (blocked) {
      for (const button of motionButtons) {
        button.querySelector("span").textContent = "播放動畫";
        button.setAttribute("aria-label", "啟動所有動畫");
        button.querySelector("use").setAttribute("href", "#play");
      }
    }
  }
  function noticeFor(video, message = "") {
    const notice = video.parentElement.querySelector(".video-notice");
    if (notice) {
      notice.textContent = message;
      notice.hidden = !message;
    }
  }
  async function playBackground(video) {
    if (!wantsBackgroundPlayback(video) || pendingPlayback.has(video) || video.error) return;
    video.muted = true;
    video.defaultMuted = true;
    loadPoster(video);
    if (!video.hasAttribute("src")) video.src = video.dataset.src;
    if (!video.paused) return;
    pendingPlayback.add(video);
    try {
      await video.play();
      blockedPlayback.delete(video);
      noticeFor(video);
      if (!wantsBackgroundPlayback(video)) video.pause();
    } catch (error) {
      if (error.name === "NotAllowedError" && wantsBackgroundPlayback(video)) {
        blockedPlayback.add(video);
        noticeFor(video, "點「播放動畫」或放大作品觀看");
      } else if (error.name === "AbortError" && wantsBackgroundPlayback(video)) {
        // 快速切換分類時，前一次 pause 可能讓尚未完成的 play 中止。
        requestAnimationFrame(() => {
          if (wantsBackgroundPlayback(video)) void playBackground(video);
        });
      } else if (error.name !== "AbortError") {
        noticeFor(video, "動畫無法播放，請放大作品後重試。");
      }
    } finally {
      pendingPlayback.delete(video);
      updateMotionControls();
    }
  }
  function syncBackground() {
    // 舊瀏覽器也依實際位置判斷，不能把整頁的作品都視為可見。
    if (!("IntersectionObserver" in window)) {
      for (const video of backgroundVideos) {
        if (isNearViewport(video)) inView.add(video);
        else inView.delete(video);
        if (isNearViewport(video, 200)) loadPoster(video);
      }
    }
    for (const video of backgroundVideos) {
      if (wantsBackgroundPlayback(video)) void playBackground(video);
      else {
        video.pause();
        // pause 不會停止下載；中止尚未完成的離屏影片，完整緩衝則保留供返回時使用。
        if (video.hasAttribute("src") && !isFullyBuffered(video)) {
          video.removeAttribute("src");
          video.load();
        }
      }
    }
    updateMotionControls();
  }
  for (const video of backgroundVideos) {
    video.muted = true;
    video.defaultMuted = true;
    video.addEventListener("error", () => noticeFor(video, "動畫載入失敗，點選作品重試"));
  }
  const visibilityObserver =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            for (const { target, isIntersecting } of entries) {
              if (isIntersecting) inView.add(target);
              else inView.delete(target);
            }
            syncBackground();
          },
          { threshold: 0.01 },
        )
      : null;
  if (visibilityObserver) {
    backgroundVideos.forEach((video) => visibilityObserver.observe(video));
    // poster 不受 preload="none" 控制，另用觀察器延後載入作品縮圖。
    const posterObserver = new IntersectionObserver(
      (entries) => {
        for (const { target, isIntersecting } of entries) {
          if (!isIntersecting || target.closest("[hidden]")) continue;
          loadPoster(target);
          posterObserver.unobserve(target);
        }
      },
      { rootMargin: "200px 0px" },
    );
    backgroundVideos
      .filter((video) => video.dataset.poster)
      .forEach((video) => posterObserver.observe(video));
  } else {
    let scheduled = false;
    const scheduleSync = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        syncBackground();
      });
    };
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
  }

  for (const button of motionButtons) {
    button.addEventListener("click", () => {
      motionWasChosen = true;
      const blocked = [...blockedPlayback].some(wantsBackgroundPlayback);
      animationsEnabled = blocked || !animationsEnabled;
      blockedPlayback.clear();
      syncBackground();
      onMotionChange();
    });
  }
  function syncMotionPreference() {
    if (!motionWasChosen) {
      animationsEnabled = !reducedMotion.matches && !connection?.saveData;
      syncBackground();
      onMotionChange();
    }
  }
  reducedMotion.addEventListener("change", syncMotionPreference);
  connection?.addEventListener("change", syncMotionPreference);

  return { sync: syncBackground, isEnabled: () => animationsEnabled };
}
