import ApexLaunchOptionsConfig from '@/data/apex_launch_options_config.ts';
import {
  aspectResolutionTable,
  buildDefaultLaunchOptions,
  buildDefaultVideoOptions,
  closestAspectPresetValue,
  FPS_CAP_MAX,
  FPS_CAP_MIN,
  quickPresetLaunchOptionToggles,
  quickPresetVideoConfigToggles,
} from '@/data/presets/apex_quick_preset.ts';
import type {
  ApexQuickPresetLaunchOptionToggle,
  ApexQuickPresetSelection,
  PrimaryDisplayInfo,
  ResolutionLockAxis,
} from '@/types/apex_quick_preset.ts';
import {isSteamLaunchOptionsImpl, type SteamLaunchOptionsImpl} from '@/types/steam.ts';

export function screenKey(width: number, height: number): string {
  return `${width}x${height}`;
}

export function clampFpsCap(fps: number): number {
  const n = Math.round(Number(fps));
  if (!Number.isFinite(n)) return FPS_CAP_MIN;
  return Math.min(Math.max(FPS_CAP_MIN, n), FPS_CAP_MAX);
}

export function defaultFpsCap(maxRefresh: number): number {
  return clampFpsCap(maxRefresh);
}

/** 屏幕原生比例与预设匹配的容差 */
export const ASPECT_SCREEN_MATCH_EPS = 0.02;

export function isAspectMatchingScreen(
  aspectValue: number,
  screenAspect: number,
  eps = ASPECT_SCREEN_MATCH_EPS,
): boolean {
  return Math.abs(aspectValue - screenAspect) <= eps;
}

/** 屏幕比例命中预设时才返回对应值,否则 null */
export function matchScreenAspectPresetValue(
  screenAspect: number,
  eps = ASPECT_SCREEN_MATCH_EPS,
): number | null {
  const closest = closestAspectPresetValue(screenAspect);
  if (closest == null) return null;
  return isAspectMatchingScreen(closest, screenAspect, eps) ? closest : null;
}

/**
 * 打开快速预设时初始比例: 已有 letterbox 设置取最近预设;
 * 否则按屏幕比例匹配,屏幕无对应预设则不选.
 */
export function resolveQuickPresetInitialAspectValue(
  hasLetterboxAspect: boolean,
  configuredAspect: number,
  screenAspect: number,
): number | null {
  if (hasLetterboxAspect) {
    return closestAspectPresetValue(configuredAspect);
  }
  return matchScreenAspectPresetValue(screenAspect);
}

export interface ComputedResolution {
  width: number;
  height: number;
  fromTable: boolean;
}

/** 查表或按锁宽/锁高算法计算游戏分辨率(四舍五入为整数像素) */
export function resolveGameResolution(
  screen: PrimaryDisplayInfo,
  aspectValue: number,
  lockAxis: ResolutionLockAxis = 'width',
): ComputedResolution {
  const key = screenKey(screen.width, screen.height);
  const tableEntry = aspectResolutionTable.find((e) => e.aspectValue === aspectValue);
  const fromTable = tableEntry?.screenToGame[key];
  if (fromTable) {
    return { width: fromTable.width, height: fromTable.height, fromTable: true };
  }

  if (lockAxis === 'width') {
    const width = screen.width;
    const height = Math.round(width / aspectValue);
    return { width, height, fromTable: false };
  }

  const height = screen.height;
  const width = Math.round(height * aspectValue);
  return { width, height, fromTable: false };
}

export const VIDEO_RESOLUTION_KEYS = {
  defaultWidth: 'setting.defaultres',
  defaultHeight: 'setting.defaultresheight',
  lastWidth: 'setting.last_display_width',
  lastHeight: 'setting.last_display_height',
} as const;

/** 将分辨率写入 videoconfig 四处键 */
export function buildVideoResolutionValues(width: number, height: number): Record<string, string> {
  return {
    [VIDEO_RESOLUTION_KEYS.defaultWidth]: String(width),
    [VIDEO_RESOLUTION_KEYS.defaultHeight]: String(height),
    [VIDEO_RESOLUTION_KEYS.lastWidth]: String(width),
    [VIDEO_RESOLUTION_KEYS.lastHeight]: String(height),
  };
}

export function formatAspectRatioLabel(aspectValue: number): string {
  const preset = [
    { v: 1, t: '1:1' },
    { v: 2, t: '2:1' },
    { v: 1.3333, t: '4:3' },
    { v: 1.25, t: '5:4' },
    { v: 1.5, t: '3:2' },
    { v: 1.6, t: '16:10' },
    { v: 1.7778, t: '16:9' },
    { v: 2.3333, t: '21:9' },
    { v: 3.5556, t: '32:9' },
  ].find((p) => Math.abs(p.v - aspectValue) < 0.001);
  const ratioText = preset?.t ?? aspectValue.toFixed(2);
  return `${ratioText} (${aspectValue.toFixed(4)})`;
}

export function buildQuickPresetPreview(
  screen: PrimaryDisplayInfo,
  selection: Pick<ApexQuickPresetSelection, 'aspectValue' | 'lockAxis'>,
): ComputedResolution {
  return resolveGameResolution(screen, selection.aspectValue, selection.lockAxis);
}

export function findLaunchOptionRef(
  toggle: ApexQuickPresetLaunchOptionToggle,
): SteamLaunchOptionsImpl | undefined {
  for (const row of ApexLaunchOptionsConfig) {
    if (!isSteamLaunchOptionsImpl(row)) continue;
    if (toggle.identifier && row.identifier === toggle.identifier) return row;
    if (toggle.parameter && typeof row.parameter === 'string' && row.parameter === toggle.parameter) {
      return row;
    }
  }
  return undefined;
}

function findLaunchOptionSelectionIndex(
  selection: SteamLaunchOptionsImpl[],
  toggle: ApexQuickPresetLaunchOptionToggle,
): number {
  return selection.findIndex((item) => {
    if (toggle.identifier && item.identifier === toggle.identifier) return true;
    if (
      toggle.parameter
      && typeof item.parameter === 'string'
      && item.parameter === toggle.parameter
    ) {
      return true;
    }
    return false;
  });
}

export function isQuickPresetLaunchOptionSelected(
  selection: SteamLaunchOptionsImpl[],
  toggle: ApexQuickPresetLaunchOptionToggle,
): boolean {
  return findLaunchOptionSelectionIndex(selection, toggle) >= 0;
}

/** 打开对话框时初始化启动项勾选：无已有配置用默认，否则按当前启动项同步 */
export function initLaunchOptionsForDialog(
  selection: SteamLaunchOptionsImpl[],
): Record<string, boolean> {
  if (selection.length === 0) {
    return buildDefaultLaunchOptions();
  }
  return Object.fromEntries(
    quickPresetLaunchOptionToggles.map((opt) => [
      opt.key,
      isQuickPresetLaunchOptionSelected(selection, opt),
    ]),
  );
}

export function applyQuickPresetLaunchOptions(
  selection: SteamLaunchOptionsImpl[],
  toggles: Record<string, boolean>,
): void {
  for (const opt of quickPresetLaunchOptionToggles) {
    const enabled = toggles[opt.key] ?? opt.defaultEnabled;
    const idx = findLaunchOptionSelectionIndex(selection, opt);
    if (!enabled) {
      if (idx >= 0) selection.splice(idx, 1);
      continue;
    }
    const option = findLaunchOptionRef(opt);
    if (!option) continue;
    if (idx < 0) {
      selection.push(option);
    }
  }
}

function videoConfigValueEquals(a: string, b: string): boolean {
  if (a === b) return true;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    return Math.abs(na - nb) < 1e-6;
  }
  return false;
}

function getVideoConfigValue(
  values: Record<string, string>,
  key: string,
): string | undefined {
  return values[key] ?? values[`"${key}"`];
}

export function matchesVideoToggleValues(
  values: Record<string, string>,
  toggleValues: Record<string, string>,
): boolean {
  return Object.entries(toggleValues).every(([key, expected]) => {
    const actual = getVideoConfigValue(values, key);
    return actual != null && videoConfigValueEquals(actual, expected);
  });
}

/** 打开对话框时初始化视频开关：匹配 onValues 为勾选，否则不勾选；无配置时用 defaultEnabled */
export function initVideoOptionsForDialog(
  values: Record<string, string>,
): Record<string, boolean> {
  if (Object.keys(values).length === 0) {
    return buildDefaultVideoOptions();
  }
  return Object.fromEntries(
    quickPresetVideoConfigToggles.map((opt) => [
      opt.key,
      matchesVideoToggleValues(values, opt.onValues),
    ]),
  );
}

/** 勾选时写入 onValues；未勾选不修改(由调用方在应用竞技基线后恢复原有值) */
export function applyQuickPresetVideoOptions(
  setValue: (identifier: string, value: string) => void,
  toggles: Record<string, boolean>,
): void {
  for (const opt of quickPresetVideoConfigToggles) {
    const enabled = toggles[opt.key] ?? opt.defaultEnabled;
    if (!enabled) continue;
    for (const [key, value] of Object.entries(opt.onValues)) {
      setValue(key, value);
    }
  }
}

export function quickPresetVideoToggleKeys(): string[] {
  return [
    ...new Set(
      quickPresetVideoConfigToggles.flatMap((opt) => Object.keys(opt.onValues)),
    ),
  ];
}

/** 未勾选的视频开关所涉及的 videoconfig 键(竞技基线与应用时均跳过) */
export function uncheckedQuickPresetVideoKeys(
  toggles: Record<string, boolean>,
): Set<string> {
  const keys = new Set<string>();
  for (const opt of quickPresetVideoConfigToggles) {
    const enabled = toggles[opt.key] ?? opt.defaultEnabled;
    if (enabled) continue;
    for (const key of Object.keys(opt.onValues)) {
      keys.add(key);
    }
  }
  return keys;
}
