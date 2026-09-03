function applyTrayTooltipTheme() {
  document.documentElement.dataset.theme = window
    .matchMedia("(prefers-color-scheme: dark)")
    .matches ? "dark" : "light";
}

window.applyTrayTooltipTheme = applyTrayTooltipTheme;
window.matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", applyTrayTooltipTheme);
applyTrayTooltipTheme();
