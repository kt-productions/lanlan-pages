import "../../shared/navigation.js";
import { setupPlayback } from "../../features/portfolio/playback.js";
import { setupGallery } from "../../features/portfolio/gallery.js";
import { setupLightbox } from "../../features/portfolio/lightbox.js";

const { works } = JSON.parse(
  document.querySelector("#portfolio-data").textContent,
);
const dialog = document.querySelector("#lightbox");
let lightbox;
const motion = setupPlayback({
  isModalOpen: () => dialog.open,
  onMotionChange: () => lightbox?.syncMotion(),
});
const gallery = setupGallery(works, motion.sync);
lightbox = setupLightbox(gallery.getWorks, motion);
