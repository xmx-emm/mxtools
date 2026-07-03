import ApexLaunchOptionsConfig from '@/data/apex_launch_options_config.ts';
import {
  aspectResolutionTable,
  buildDefaultLaunchOptions,
  FPS_CAP_MAX,
  quickPresetLaunchOptionToggles,
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

export function defaultFpsCap(maxRefresh: number): number {
  return Math.min(Math.max(1, Math.round(maxRefresh)), FPS_CAP_MAX);
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
    { v: 0.5, t: '1:2' },
    { v: 2, t: '2:1' },
    { v: 0.75, t: '3:4' },
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
    const option = findLaunchOptionRef(opt);
    if (!option) continue;
    const idx = findLaunchOptionSelectionIndex(selection, opt);
    if (enabled && idx < 0) {
      selection.push(option);
    } else if (!enabled && idx >= 0) {
      selection.splice(idx, 1);
    }
  }
}
