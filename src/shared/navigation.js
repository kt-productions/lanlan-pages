const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("#main-nav");
menuToggle.hidden = false;
menuToggle.closest("header").classList.add("has-navigation");

function closeMenu() {
  menuToggle.setAttribute("aria-expanded", "false");
  nav.classList.remove("is-open");
}
menuToggle.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") !== "true";
  menuToggle.setAttribute("aria-expanded", String(open));
  nav.classList.toggle("is-open", open);
});
nav.addEventListener("click", (event) => {
  if (event.target.closest("a")) closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    menuToggle.getAttribute("aria-expanded") === "true"
  ) {
    closeMenu();
    menuToggle.focus();
  }
});

// 跨過手機斷點時收合選單，避免回到窄螢幕仍保留過期的展開狀態。
matchMedia("(max-width: 760px)").addEventListener("change", closeMenu);
document.addEventListener("click", (event) => {
  if (!menuToggle.closest("header").contains(event.target)) closeMenu();
});

document.querySelector("#year").textContent = new Date().getFullYear();
