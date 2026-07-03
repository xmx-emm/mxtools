export const NAV_MIN_WIDTH = 56;
export const NAV_PRIMARY_MAX = 160;
export const NAV_SECONDARY_MAX = 220;
/** 低于此宽度视为折叠态(仅图标),松手吸附到 NAV_MIN_WIDTH */
export const NAV_COLLAPSE_SNAP_THRESHOLD = 88;

export function clampNavPrimaryWidth(width: number): number {
  return Math.min(NAV_PRIMARY_MAX, Math.max(NAV_MIN_WIDTH, width));
}

export function clampNavSecondaryWidth(width: number): number {
  return Math.min(NAV_SECONDARY_MAX, Math.max(NAV_MIN_WIDTH, width));
}

export function isNavPanelCollapsed(width: number): boolean {
  return width < NAV_COLLAPSE_SNAP_THRESHOLD;
}

export function snapNavPanelWidth(width: number, max: number): number {
  const clamped = Math.min(max, Math.max(NAV_MIN_WIDTH, width));
  if (clamped < NAV_COLLAPSE_SNAP_THRESHOLD) {
    return NAV_MIN_WIDTH;
  }
  return clamped;
}
