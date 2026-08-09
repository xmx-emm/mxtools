import {emit, listen, type UnlistenFn} from '@tauri-apps/api/event';

export type ApexExternalConfigScope = 'launch' | 'video' | 'gameSettings';

export const APEX_CONFIG_CHANGED_EVENT = 'mx-apex-config-changed';
export const APEX_QUICK_PRESET_ACCOUNT_EVENT = 'mx-apex-quick-preset-account';
export const APEX_LAUNCH_REPAIR_ACCOUNT_EVENT = 'mx-apex-launch-repair-account';
const APEX_CONFIG_CHANGE_STORAGE_KEY = 'mx-apex-config-change-v1';
const APEX_CONFIG_CHANGE_SEEN_KEY = 'mx-apex-config-change-seen-v1';
const APEX_QUICK_PRESET_ACCOUNT_STORAGE_KEY = 'mx-apex-quick-preset-account-v1';
const APEX_LAUNCH_REPAIR_ACCOUNT_STORAGE_KEY = 'mx-apex-launch-repair-account-v1';

export interface ApexConfigChangedPayload {
  scopes: ApexExternalConfigScope[]
  revision: string
}

export interface ApexQuickPresetAccountPayload {
  accountKey: string | null
}

export interface ApexLaunchRepairAccountPayload {
  accountKey: string | null
}

export function emitApexConfigChanged(scopes: ApexExternalConfigScope[]): Promise<void> {
  const payload: ApexConfigChangedPayload = {
    scopes: [...new Set(scopes)],
    revision: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
  try {
    localStorage.setItem(APEX_CONFIG_CHANGE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // The live event still synchronizes open windows when storage is unavailable.
  }
  return emit(APEX_CONFIG_CHANGED_EVENT, payload);
}

export function pendingApexConfigChange(): ApexConfigChangedPayload | null {
  try {
    const raw = localStorage.getItem(APEX_CONFIG_CHANGE_STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as Partial<ApexConfigChangedPayload>;
    if (typeof payload.revision !== 'string' || !Array.isArray(payload.scopes)) return null;
    if (sessionStorage.getItem(APEX_CONFIG_CHANGE_SEEN_KEY) === payload.revision) return null;
    const scopes = payload.scopes.filter((scope): scope is ApexExternalConfigScope => (
      scope === 'launch' || scope === 'video' || scope === 'gameSettings'
    ));
    return {revision: payload.revision, scopes: [...new Set(scopes)]};
  } catch {
    return null;
  }
}

export function markApexConfigChangeSeen(revision: string) {
  try {
    sessionStorage.setItem(APEX_CONFIG_CHANGE_SEEN_KEY, revision);
  } catch {
    // The next live event can retry synchronization when storage is unavailable.
  }
}

export function listenApexConfigChanged(
  handler: (payload: ApexConfigChangedPayload) => void | Promise<void>,
): Promise<UnlistenFn> {
  return listen<ApexConfigChangedPayload>(APEX_CONFIG_CHANGED_EVENT, event => {
    void Promise.resolve(handler(event.payload)).catch(error => {
      console.warn('synchronize Apex configuration event failed', error);
    });
  });
}

export function emitApexQuickPresetAccount(accountKey: string | null): Promise<void> {
  rememberApexQuickPresetAccount(accountKey);
  return emit(APEX_QUICK_PRESET_ACCOUNT_EVENT, {
    accountKey,
  } satisfies ApexQuickPresetAccountPayload);
}

export function rememberApexQuickPresetAccount(accountKey: string | null) {
  try {
    localStorage.setItem(APEX_QUICK_PRESET_ACCOUNT_STORAGE_KEY, JSON.stringify({accountKey}));
  } catch {
    // The route query and live event remain available when storage is unavailable.
  }
}

export function latestApexQuickPresetAccount(): string | null {
  try {
    const raw = localStorage.getItem(APEX_QUICK_PRESET_ACCOUNT_STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as {accountKey?: unknown};
    return typeof payload.accountKey === 'string' ? payload.accountKey : null;
  } catch {
    return null;
  }
}

export function listenApexQuickPresetAccount(
  handler: (payload: ApexQuickPresetAccountPayload) => void | Promise<void>,
): Promise<UnlistenFn> {
  return listen<ApexQuickPresetAccountPayload>(APEX_QUICK_PRESET_ACCOUNT_EVENT, event => {
    void Promise.resolve(handler(event.payload)).catch(error => {
      console.warn('synchronize Apex quick preset account failed', error);
    });
  });
}

export function emitApexLaunchRepairAccount(accountKey: string | null): Promise<void> {
  rememberApexLaunchRepairAccount(accountKey);
  return emit(APEX_LAUNCH_REPAIR_ACCOUNT_EVENT, {
    accountKey,
  } satisfies ApexLaunchRepairAccountPayload);
}

export function rememberApexLaunchRepairAccount(accountKey: string | null) {
  try {
    localStorage.setItem(APEX_LAUNCH_REPAIR_ACCOUNT_STORAGE_KEY, JSON.stringify({accountKey}));
  } catch {
    // The route query and live event remain available when storage is unavailable.
  }
}

export function latestApexLaunchRepairAccount(): string | null {
  try {
    const raw = localStorage.getItem(APEX_LAUNCH_REPAIR_ACCOUNT_STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as {accountKey?: unknown};
    return typeof payload.accountKey === 'string' ? payload.accountKey : null;
  } catch {
    return null;
  }
}

export function listenApexLaunchRepairAccount(
  handler: (payload: ApexLaunchRepairAccountPayload) => void | Promise<void>,
): Promise<UnlistenFn> {
  return listen<ApexLaunchRepairAccountPayload>(APEX_LAUNCH_REPAIR_ACCOUNT_EVENT, event => {
    void Promise.resolve(handler(event.payload)).catch(error => {
      console.warn('synchronize Apex launch repair account failed', error);
    });
  });
}
