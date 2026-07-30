export const NAV_MIN_WIDTH = 56;
/** Safety caps; the live expanded widths are measured from rendered labels. */
export const NAV_PRIMARY_MAX = 160;
export const NAV_SECONDARY_MAX = 220;
export const NAV_PRIMARY_EXPANDED_MIN = 112;
export const NAV_SECONDARY_EXPANDED_MIN = 120;
export const NAV_LABEL_CHROME_WIDTH = 68;

/** 折叠与完整展开宽度的中点，拖过一半才切换吸附目标。 */
export function navPanelSnapThreshold(max: number): number {
  return NAV_MIN_WIDTH + (max - NAV_MIN_WIDTH) / 2;
}

export function clampNavPrimaryWidth(width: number): number {
  return Math.min(NAV_PRIMARY_MAX, Math.max(NAV_MIN_WIDTH, width));
}

export function clampNavSecondaryWidth(width: number): number {
  return Math.min(NAV_SECONDARY_MAX, Math.max(NAV_MIN_WIDTH, width));
}

export function isNavPanelCollapsed(width: number, max: number): boolean {
  return width < navPanelSnapThreshold(max);
}

export function navPanelExpandedWidth(
  maxLabelWidth: number,
  minExpanded: number,
  hardMax: number,
): number {
  const contentWidth = Math.ceil(Math.max(0, maxLabelWidth)) + NAV_LABEL_CHROME_WIDTH;
  return Math.min(hardMax, Math.max(minExpanded, contentWidth));
}

/**
 * Keep labels hidden until the icon column has enough room, then reveal them
 * continuously while dragging instead of switching at the snap threshold.
 */
export function navPanelLabelProgress(width: number, max: number): number {
  const clamped = Math.min(max, Math.max(NAV_MIN_WIDTH, width));
  const revealStart = NAV_MIN_WIDTH + 8;
  const revealEnd = Math.max(revealStart + 1, max - 12);
  if (clamped <= revealStart) return 0;
  if (clamped >= revealEnd) return 1;
  return (clamped - revealStart) / (revealEnd - revealStart);
}

export function snapNavPanelWidth(width: number, max: number): number {
  const clamped = Math.min(max, Math.max(NAV_MIN_WIDTH, width));
  return isNavPanelCollapsed(clamped, max) ? NAV_MIN_WIDTH : max;
}
