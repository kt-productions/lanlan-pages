// 播放許可由可見範圍、使用者選擇、分頁及檢視器共同決定，避免背景影片持續下載或播放。
export function setupPlayback({ isModalOpen, onMotionChange = () => {} }) {
  const backgroundVideos = [
    ...document.querySelectorAll("video[data-autoplay]"),
  ];
  const motionButtons = [
    ...document.querySelectorAll("[data-animation-toggle]"),
  ];
  const playbackStatus = document.querySelector("#playback-status");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const inView = new WeakSet();
  const pendingPlayback = new WeakSet();
  const blockedPlayback = new Set();
  let animationsEnabled = !reducedMotion.matches;
  let motionWasChosen = false;

  function wantsBackgroundPlayback(video) {
    return (
      animationsEnabled &&
      !document.hidden &&
      !isModalOpen() &&
      inView.has(video) &&
      !video.closest("[hidden]")
    );
  }
  function updateMotionControls() {
    for (const button of motionButtons) {
      button.hidden = false;
      button.setAttribute("aria-pressed", String(!animationsEnabled));
      button.setAttribute(
        "aria-label",
        animationsEnabled ? "暫停所有動畫" : "播放所有動畫",
      );
      button.querySelector("span").textContent = animationsEnabled
        ? "暫停動畫"
        : "播放動畫";
      button
        .querySelector("use")
        .setAttribute("href", animationsEnabled ? "#pause" : "#play");
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
    if (
      !wantsBackgroundPlayback(video) ||
      pendingPlayback.has(video) ||
      video.error
    )
      return;
    video.muted = true;
    video.defaultMuted = true;
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
      } else if (
        error.name === "AbortError" &&
        wantsBackgroundPlayback(video)
      ) {
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
    for (const video of backgroundVideos) {
      if (wantsBackgroundPlayback(video)) void playBackground(video);
      else video.pause();
    }
    updateMotionControls();
  }
  for (const video of backgroundVideos) {
    video.muted = true;
    video.defaultMuted = true;
    video.addEventListener("error", () =>
      noticeFor(video, "動畫載入失敗，點選作品重試"),
    );
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
  if (visibilityObserver)
    backgroundVideos.forEach((video) => visibilityObserver.observe(video));
  else backgroundVideos.forEach((video) => inView.add(video));

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
  reducedMotion.addEventListener("change", () => {
    if (!motionWasChosen) {
      animationsEnabled = !reducedMotion.matches;
      syncBackground();
      onMotionChange();
    }
  });

  return { sync: syncBackground, isEnabled: () => animationsEnabled };
}
