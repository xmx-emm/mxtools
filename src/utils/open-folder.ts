import {invoke} from '@tauri-apps/api/core';
import {openPath} from '@tauri-apps/plugin-opener';

/** 配置文件路径的父目录(Steam localconfig.vdf、EA user_*.ini 等) */
export function parentDirOfFile(filePath: string): string {
  const normalized = filePath.trim();
  const sepIdx = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'));
  if (sepIdx <= 0) return normalized;
  return normalized.slice(0, sepIdx);
}

export async function openFolderDetached(folderPath: string): Promise<void> {
  await invoke('open_folder_detached', {path: folderPath});
}

/** 在资源管理器中打开配置文件所在目录 */
export async function openConfigFileFolder(configPath: string | null | undefined): Promise<void> {
  if (!configPath?.trim()) {
    throw new Error('NO_CONFIG_PATH');
  }
  await openFolderDetached(parentDirOfFile(configPath));
}

/** Apex `videoconfig.txt` 所在目录(Saved Games/Respawn/Apex/local) */
export async function openApexVideoConfigFolder(): Promise<void> {
  const path = await invoke<string>('get_apex_videoconfig_folder_path');
  await openPath(path);
}
