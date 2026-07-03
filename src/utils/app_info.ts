import { invoke } from '@tauri-apps/api/core';
import type { AppInfo } from '@/types/app.ts';

export function fetchAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>('get_app_info');
}
