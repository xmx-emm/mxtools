function applyTrayTooltipTheme() {
  try {
    const theme = localStorage.getItem("mx-theme") === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    const accent = JSON.parse(localStorage.getItem("mx-accent") || "null");
    if (accent && typeof accent.p === "string") {
      document.documentElement.style.setProperty("--tip-primary", accent.p);
      document.documentElement.style.setProperty(
        "--tip-border",
        `color-mix(in srgb, ${accent.p} 24%, transparent)`,
      );
    }
  } catch {
    document.documentElement.dataset.theme = "light";
  }
}

window.applyTrayTooltipTheme = applyTrayTooltipTheme;
window.addEventListener("storage", applyTrayTooltipTheme);
applyTrayTooltipTheme();
