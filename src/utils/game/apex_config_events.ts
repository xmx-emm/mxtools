import {emit, listen, type UnlistenFn} from '@tauri-apps/api/event';

export type ApexExternalConfigScope = 'launch' | 'video' | 'gameSettings';
export type ApexConfigNotification = 'quickPresetApplied';

export const APEX_CONFIG_CHANGED_EVENT = 'mx-apex-config-changed';
export const APEX_QUICK_PRESET_ACCOUNT_EVENT = 'mx-apex-quick-preset-account';
export const APEX_LAUNCH_REPAIR_ACCOUNT_EVENT = 'mx-apex-launch-repair-account';

export interface ApexConfigChangedPayload {
  scopes: ApexExternalConfigScope[]
  revision: string
  notification?: ApexConfigNotification
}

export interface ApexQuickPresetAccountPayload {
  accountKey: string | null
}

export interface ApexLaunchRepairAccountPayload {
  accountKey: string | null
}

export function emitApexConfigChanged(
  scopes: ApexExternalConfigScope[],
  options?: {notification?: ApexConfigNotification},
): Promise<void> {
  const payload: ApexConfigChangedPayload = {
    scopes: [...new Set(scopes)],
    revision: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...(options?.notification ? {notification: options.notification} : {}),
  };
  return emit(APEX_CONFIG_CHANGED_EVENT, payload);
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
  return emit(APEX_QUICK_PRESET_ACCOUNT_EVENT, {
    accountKey,
  } satisfies ApexQuickPresetAccountPayload);
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
  return emit(APEX_LAUNCH_REPAIR_ACCOUNT_EVENT, {
    accountKey,
  } satisfies ApexLaunchRepairAccountPayload);
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
