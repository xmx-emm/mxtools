export function isDarkStyle(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function isLightStyle(): boolean {
  return window.matchMedia('(prefers-color-scheme: light)').matches;
}
