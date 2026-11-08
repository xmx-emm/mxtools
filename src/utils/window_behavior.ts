import {setCloseToTray} from '@/ipc/commands.ts';

export type WindowBehaviorPrefs = {
  closeToTray: boolean;
};

export function defaultWindowBehaviorPrefs(): WindowBehaviorPrefs {
  return {closeToTray: false};
}

export async function syncCloseToTray(enabled: boolean) {
  await setCloseToTray({enabled});
}

export async function applyWindowBehavior(prefs: WindowBehaviorPrefs) {
  await syncCloseToTray(prefs.closeToTray);
}
