/** 主显示器信息(与 Tauri get_primary_display_info 对应) */
export interface PrimaryDisplayInfo {
  width: number;
  height: number;
  aspectRatio: number;
  maxRefreshRate: number;
}

export type ResolutionLockAxis = 'width' | 'height';

export interface ApexAspectPreset {
  /** i18n key */
  label: string;
  aspectValue: number;
}

/** 比例 + 屏幕原生分辨率 -> 游戏内分辨率查表项 */
export interface ApexAspectResolutionEntry {
  aspectValue: number;
  /** 屏幕原生分辨率 key，如 "2560x1440" */
  screenToGame: Record<string, { width: number; height: number }>;
}

/** 画质档位：values 与 apex_video_config enum.options[].values 格式一致 */
export interface ApexGraphicsQualityPreset {
  identifier: string;
  name: string;
  description?: string;
  values: Record<string, string>;
}

/** 快速预设可选启动项 */
export interface ApexQuickPresetLaunchOptionToggle {
  key: string;
  /** i18n key，复用 apexLaunchOptions.*.name */
  label: string;
  identifier?: string;
  parameter?: string;
  defaultEnabled: boolean;
}

/** 快速预设可选视频配置开关 */
export interface ApexQuickPresetVideoToggle {
  key: string;
  /** i18n key */
  label: string;
  /** 勾选时写入的 videoconfig 键值 */
  onValues: Record<string, string>;
  /** 取消勾选时写入的 videoconfig 键值 */
  offValues: Record<string, string>;
  defaultEnabled: boolean;
  /** apex_video_config 中对应项 identifier，用于右键 tip */
  tipIdentifier?: string;
}

export interface ApexQuickPresetSelection {
  fpsCap: number;
  aspectValue: number;
  lockAxis: ResolutionLockAxis;
  /** 是否应用分辨率与比例预设(启动项 + videoconfig 分辨率) */
  enableResolutionPreset: boolean;
  graphicsPresetId: string;
  /** 启用透明准星(+reticle_color) */
  enableSimplifiedReticle: boolean;
  /** 可选启动项 key -> 是否启用 */
  launchOptions: Record<string, boolean>;
  /** 视频配置开关 key -> 是否启用(onValues) */
  videoOptions: Record<string, boolean>;
}
