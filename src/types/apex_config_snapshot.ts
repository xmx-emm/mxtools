/** Apex 配置快照 JSON（导入/导出） */

export const APEX_CONFIG_SNAPSHOT_KIND = 'apex-config-snapshot' as const;
export const APEX_CONFIG_SNAPSHOT_VERSION = 2 as const;
export type ApexConfigSnapshotVersion = 1 | typeof APEX_CONFIG_SNAPSHOT_VERSION;

import type {ApexGameSettingsSnapshot} from './apex_game_settings.ts';

export interface ApexConfigSnapshotLaunchOptions {
  raw: string;
}

export interface ApexConfigSnapshot {
  version: ApexConfigSnapshotVersion;
  kind: typeof APEX_CONFIG_SNAPSHOT_KIND;
  exportedAt: string;
  launchOptions?: ApexConfigSnapshotLaunchOptions;
  videoConfig?: Record<string, string>;
  gameSettings?: ApexGameSettingsSnapshot;
}

/** 导出时用户勾选的块 */
export interface ApexConfigSnapshotExportSelection {
  launchOptions: boolean;
  videoConfig: boolean;
  gameSettings?: boolean;
  bindings?: boolean;
}

/** 导入预览：视频配置按 schema 分组的一行 */
export interface ApexConfigSnapshotVideoPreviewItem {
  /** 稳定 id（schema identifier 或 raw key） */
  id: string;
  /** i18n key；未知键时为空，界面显示 rawKey */
  labelKey: string | null;
  rawKey?: string;
  /** 勾选该行时要写入的键 */
  keys: string[];
  /** 预览用：key=value 摘要 */
  valuesPreview: string;
}

export type ApexConfigSnapshotVideoSelectMode = 'all' | 'items';

export interface ApexConfigSnapshotApplySelection {
  importLaunchOptions: boolean;
  importVideoConfig: boolean;
  videoSelectMode: ApexConfigSnapshotVideoSelectMode;
  /** 按项模式下选中的 preview item id */
  selectedVideoItemIds: string[];
  importGameSettings?: boolean;
  importBindings?: boolean;
}
