import {apexQSetCloseToTray, setBackgroundRuntimeAutostart} from '@/ipc/commands.ts';
import {APEX_Q_STORAGE_KEY} from '@/types/apex_q.ts';

export type WindowBehaviorPrefs = {
  closeToTray: boolean;
};

export type LegacyWindowBehaviorPrefs = WindowBehaviorPrefs & {
  autostart: boolean;
  startInTray: boolean;
};

export const WINDOW_BEHAVIOR_STORAGE_KEY = 'mx-window-behavior';

export function defaultWindowBehaviorPrefs(): WindowBehaviorPrefs {
  return {closeToTray: false};
}

export function loadWindowBehaviorPrefs(): LegacyWindowBehaviorPrefs {
  const defaults: LegacyWindowBehaviorPrefs = {
    ...defaultWindowBehaviorPrefs(),
    autostart: false,
    startInTray: false,
  };
  try {
    const raw = localStorage.getItem(WINDOW_BEHAVIOR_STORAGE_KEY);
    if (!raw) return defaults;
    return {...defaults, ...(JSON.parse(raw) as Partial<LegacyWindowBehaviorPrefs>)};
  } catch {
    return defaults;
  }
}

export function saveWindowBehaviorPrefs(prefs: WindowBehaviorPrefs) {
  localStorage.setItem(WINDOW_BEHAVIOR_STORAGE_KEY, JSON.stringify(prefs));
}

/** Reads legacy Apex Q ownership fields without adding them to new prefs. */
export function migrateApexQWindowBehaviorIfNeeded(
  current: LegacyWindowBehaviorPrefs,
): LegacyWindowBehaviorPrefs {
  try {
    const raw = localStorage.getItem(APEX_Q_STORAGE_KEY);
    if (!raw) return current;
    const legacy = JSON.parse(raw) as Partial<LegacyWindowBehaviorPrefs>;
    return {
      autostart: current.autostart || legacy.autostart === true,
      closeToTray: current.closeToTray || legacy.closeToTray === true,
      startInTray: current.startInTray || legacy.startInTray === true,
    };
  } catch {
    return current;
  }
}

export async function syncCloseToTray(enabled: boolean) {
  await apexQSetCloseToTray({enabled});
}

export async function migrateLegacyAutostart(enabled: boolean) {
  if (!enabled) return;
  await setBackgroundRuntimeAutostart(true);
}

export async function applyWindowBehavior(prefs: WindowBehaviorPrefs) {
  saveWindowBehaviorPrefs(prefs);
  await syncCloseToTray(prefs.closeToTray);
}
