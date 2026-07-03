/** 实测锚点：滑条值 → dvs_enable / gpuframetime_min / gpuframetime_max */
export const APEX_DVS_FPS_LUT = [
  { target: 0, enable: '0', min: 38000, max: 39200 },
  { target: 2, enable: '1', min: 475000, max: 490000 },
  { target: 10, enable: '1', min: 95000, max: 98000 },
  { target: 25, enable: '1', min: 38000, max: 39200 },
  { target: 50, enable: '1', min: 19000, max: 19600 },
  { target: 75, enable: '1', min: 12668, max: 13067 },
  { target: 100, enable: '1', min: 9500, max: 9800 },
] as const;

const FRAME_TIME_NUMERATOR = 950_000;
const FRAME_TIME_MAX_RATIO = 39200 / 38000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface DvsConfigValues {
  enable: string;
  min: string;
  max: string;
}

/** 滑条 0–100 → videoconfig 键值 */
export function dvsTargetToConfig(target: number): DvsConfigValues {
  const rounded = Math.round(clamp(target, 0, 100));
  if (rounded <= 0) {
    return { enable: '0', min: '38000', max: '39200' };
  }
  const min = Math.round(FRAME_TIME_NUMERATOR / rounded);
  const max = Math.round(min * FRAME_TIME_MAX_RATIO);
  return { enable: '1', min: String(min), max: String(max) };
}

/** videoconfig 键值 → 滑条 0–100 */
export function configToDvsTarget(enable: string, minRaw: string | number): number {
  const enabled = enable === '1' || enable === 'true';
  if (!enabled) return 0;
  const min = typeof minRaw === 'number' ? minRaw : Number(minRaw);
  if (!Number.isFinite(min) || min <= 0) return 0;
  return clamp(Math.round(FRAME_TIME_NUMERATOR / min), 1, 100);
}

/** 界面 parameter_info 显示 */
export function formatDvsTargetDisplay(target: number, offLabel = '关'): string {
  const rounded = Math.round(clamp(target, 0, 100));
  if (rounded <= 0) return offLabel;
  return String(rounded);
}

export const APEX_TSAA_ANTIALIAS_VALUE = '12';
export const APEX_VSYNC_DOUBLE_BUFFER_MODE = '1';

export type DvsConstraintTrigger = 'dvs' | 'vsync' | 'antialias';

function isDvsEnabled(enable: string): boolean {
  return enable === '1' || enable === 'true';
}

function writeDvsOff(set: (key: string, value: string) => void) {
  const off = dvsTargetToConfig(0);
  set('setting.dvs_enable', off.enable);
  set('setting.dvs_gpuframetime_min', off.min);
  set('setting.dvs_gpuframetime_max', off.max);
}

/**
 * DVS / 垂直同步双缓冲 / TSAA 联动：
 * - 开启 DVS → 强制 TSAA；若当前为双缓冲则改为三重缓冲
 * - 选择双缓冲 → 强制 DVS 关闭
 * - 关闭 TSAA → 强制 DVS 关闭
 */
export function applyDvsRelatedConstraints(
  get: (key: string) => string,
  set: (key: string, value: string) => void,
  trigger: DvsConstraintTrigger,
): void {
  if (trigger === 'dvs') {
    if (!isDvsEnabled(get('setting.dvs_enable'))) return;
    if (get('setting.mat_antialias_mode') !== APEX_TSAA_ANTIALIAS_VALUE) {
      set('setting.mat_antialias_mode', APEX_TSAA_ANTIALIAS_VALUE);
    }
    if (get('setting.mat_vsync_mode') === APEX_VSYNC_DOUBLE_BUFFER_MODE) {
      set('setting.mat_vsync_mode', '2');
      set('setting.mat_backbuffer_count', '2');
    }
    return;
  }

  if (trigger === 'vsync') {
    if (
      get('setting.mat_vsync_mode') === APEX_VSYNC_DOUBLE_BUFFER_MODE
      && isDvsEnabled(get('setting.dvs_enable'))
    ) {
      writeDvsOff(set);
    }
    return;
  }

  if (trigger === 'antialias') {
    if (
      get('setting.mat_antialias_mode') !== APEX_TSAA_ANTIALIAS_VALUE
      && isDvsEnabled(get('setting.dvs_enable'))
    ) {
      writeDvsOff(set);
    }
  }
}
