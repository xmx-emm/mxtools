import type { AppInfo } from '@/types/app.ts';
import {getAppInfo} from '@/ipc/commands.ts';

export function fetchAppInfo(): Promise<AppInfo> {
  return getAppInfo();
}
