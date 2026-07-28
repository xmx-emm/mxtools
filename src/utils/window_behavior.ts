import {enable as enableAutostart, disable as disableAutostart, isEnabled as isAutostartEnabled} from '@tauri-apps/plugin-autostart';
import {alterQSetCloseToTray, isLaunchedFromAutostart} from '@/ipc/commands.ts';
import {loadAlterQPrefs} from '@/types/alter_q.ts';

export type WindowBehaviorPrefs = {
  /** 开机随 Windows 启动 */
  autostart: boolean;
  /** 关闭主窗口时最小化到托盘，否则退出 */
  closeToTray: boolean;
  /** 仅开机自启时不显示主窗口，直接进托盘（手动启动始终显示） */
  startInTray: boolean;
};

export const WINDOW_BEHAVIOR_STORAGE_KEY = 'mx-window-behavior';

export function defaultWindowBehaviorPrefs(): WindowBehaviorPrefs {
  return {
    autostart: false,
    closeToTray: false,
    startInTray: false,
  };
}

/** 启动早期可读（Pinia / tauri-store 尚未就绪） */
export function loadWindowBehaviorPrefs(): WindowBehaviorPrefs {
  try {
    const raw = localStorage.getItem(WINDOW_BEHAVIOR_STORAGE_KEY);
    if (!raw) return defaultWindowBehaviorPrefs();
    const parsed = JSON.parse(raw) as Partial<WindowBehaviorPrefs>;
    return {...defaultWindowBehaviorPrefs(), ...parsed};
  } catch {
    return defaultWindowBehaviorPrefs();
  }
}

export function saveWindowBehaviorPrefs(prefs: WindowBehaviorPrefs) {
  localStorage.setItem(WINDOW_BEHAVIOR_STORAGE_KEY, JSON.stringify(prefs));
}

/**
 * 旧版把托盘/自启写在琉雀 Q prefs 里；首次迁到全局设置。
 * 返回是否发生了迁移（调用方可写回 settings store）。
 */
export function migrateAlterQWindowBehaviorIfNeeded(
  current: WindowBehaviorPrefs,
): WindowBehaviorPrefs {
  if (current.autostart || current.closeToTray || current.startInTray) {
    return current;
  }
  const aq = loadAlterQPrefs();
  if (!aq.autostart && !aq.closeToTray && !aq.startInTray) {
    return current;
  }
  const migrated: WindowBehaviorPrefs = {
    autostart: aq.autostart,
    closeToTray: aq.closeToTray,
    startInTray: aq.startInTray,
  };
  saveWindowBehaviorPrefs(migrated);
  return migrated;
}

export async function syncCloseToTray(enabled: boolean) {
  await alterQSetCloseToTray({enabled});
}

export async function syncAutostart(want: boolean) {
  try {
    const current = await isAutostartEnabled();
    if (want) {
      // 始终 enable，以便写入/刷新 `--autostart` 启动参数（升级后旧注册项可能没有）
      await enableAutostart();
    } else if (current) {
      await disableAutostart();
    }
  } catch (e) {
    console.warn('autostart sync failed', e);
  }
}

/** 手动/调试启动始终显示；仅开机自启且勾选 startInTray 时隐藏主窗口 */
export async function shouldShowMainWindowOnBoot(): Promise<boolean> {
  const prefs = loadWindowBehaviorPrefs();
  if (!prefs.startInTray) return true;
  try {
    return !(await isLaunchedFromAutostart());
  } catch {
    return true;
  }
}

export async function applyWindowBehavior(prefs: WindowBehaviorPrefs) {
  saveWindowBehaviorPrefs(prefs);
  await syncCloseToTray(prefs.closeToTray);
  await syncAutostart(prefs.autostart);
}
