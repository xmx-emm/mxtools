import type {
  ApexAspectPreset,
  ApexAspectResolutionEntry,
  ApexGraphicsQualityPreset,
  ApexQuickPresetLaunchOptionToggle,
  ApexQuickPresetVideoToggle,
} from '@/types/apex_quick_preset.ts';

/** Apex 锁帧下限(Hz) */
export const FPS_CAP_MIN = 24;

/** Apex 锁帧上限(Hz) */
export const FPS_CAP_MAX = 279;

/** 快速预设比例：mat_letterbox_aspect_threshold 固定值 */
export const ASPECT_LETTERBOX_THRESHOLD = 8;

/** 比例预设(与启动项 letterbox aspect 一致; 仅宽≥高的横屏比例) */
export const aspectPresets: ApexAspectPreset[] = [
  { label: 'apexQuickPreset.aspect.1_1', aspectValue: 1 },
  { label: 'apexQuickPreset.aspect.2_1', aspectValue: 2 },
  { label: 'apexQuickPreset.aspect.4_3', aspectValue: 1.3333 },
  { label: 'apexQuickPreset.aspect.5_4', aspectValue: 1.25 },
  { label: 'apexQuickPreset.aspect.3_2', aspectValue: 1.5 },
  { label: 'apexQuickPreset.aspect.16_10', aspectValue: 1.6 },
  { label: 'apexQuickPreset.aspect.16_9', aspectValue: 1.7778 },
  { label: 'apexQuickPreset.aspect.21_9', aspectValue: 2.3333 },
  { label: 'apexQuickPreset.aspect.32_9', aspectValue: 3.5556 },
];

export function sortedAspectPresets(values: ApexAspectPreset[] = aspectPresets): ApexAspectPreset[] {
  return [...values].sort((a, b) => a.aspectValue - b.aspectValue);
}

export function findAspectPresetByValue(
  value: number,
  values: ApexAspectPreset[] = aspectPresets,
): ApexAspectPreset | undefined {
  return values.find((p) => Math.abs(p.aspectValue - value) < 0.001);
}

/** 与预设列表中某一档最接近的比例值 */
export function closestAspectPresetValue(
  value: number,
  values: ApexAspectPreset[] = aspectPresets,
): number | null {
  if (values.length === 0) return null;
  let best = values[0];
  for (const preset of values) {
    if (Math.abs(preset.aspectValue - value) < Math.abs(best.aspectValue - value)) {
      best = preset;
    }
  }
  return best.aspectValue;
}

/**
 * 比例 + 屏幕分辨率查表；未命中时由算法按锁宽/锁高计算。
 * 后续可直接在此追加 screenToGame 条目。
 *   {
 *     aspectValue: 1.7778,
 *     screenToGame: {
 *       '1920x1080': { width: 1920, height: 1080 },
 *       '2560x1440': { width: 2560, height: 1440 },
 *       '3840x2160': { width: 3840, height: 2160 },
 *     },
 *   },
 *   {
 *     aspectValue: 2.3333,
 *     screenToGame: {
 *       '2560x1080': { width: 2560, height: 1080 },
 *       '3440x1440': { width: 3440, height: 1440 },
 *     },
 *   },
 *   {
 *     aspectValue: 1.3333,
 *     screenToGame: {
 *       '1920x1080': { width: 1440, height: 1080 },
 *       // '2560x1440': { width: 1920, height: 1440 },
 *     },
 *   },
 */
export const aspectResolutionTable: ApexAspectResolutionEntry[] = [
];

/**
 * 画面设置画质档位。
 * values 键名对应 videoconfig.txt 中 setting.*，与 apex_video_config 枚举档位一致。
 */
export const graphicsQualityPresets: ApexGraphicsQualityPreset[] = [
  {
    identifier: 'competitive',
    name: 'apexQuickPreset.graphicsPresets.competitive',
    description: 'apexQuickPreset.graphicsPresets.competitiveDesc',
    values: {
      'setting.stream_memory': '0',
      'setting.mat_picmip': '3',
      'setting.dynamic_streaming_budget': '0',
      'setting.r_lod_switch_scale': '2',
    },
  },
  {
    identifier: 'low',
    name: 'apexVideoConfig.options.low',
    description: 'apexQuickPreset.graphicsPresets.lowDesc',
    values: {
      'setting.stream_memory': '300000',
      'setting.mat_picmip': '0',
      'setting.dynamic_streaming_budget': '1',
      'setting.r_lod_switch_scale': '0.6',
    },
  },
  {
    identifier: 'medium',
    name: 'apexVideoConfig.options.medium',
    description: 'apexQuickPreset.graphicsPresets.mediumDesc',
    values: {
      'setting.stream_memory': '600000',
      'setting.mat_picmip': '0',
      'setting.dynamic_streaming_budget': '1',
      'setting.r_lod_switch_scale': '0.8',
    },
  },
  {
    identifier: 'high',
    name: 'apexVideoConfig.options.high',
    description: 'apexQuickPreset.graphicsPresets.highDesc',
    values: {
      'setting.stream_memory': '1000000',
      'setting.mat_picmip': '0',
      'setting.dynamic_streaming_budget': '1',
      'setting.r_lod_switch_scale': '1',
    },
  },
  {
    identifier: 'very_high',
    name: 'apexVideoConfig.options.veryHigh',
    description: 'apexQuickPreset.graphicsPresets.veryHighDesc',
    values: {
      'setting.stream_memory': '2000000',
      'setting.mat_picmip': '0',
      'setting.dynamic_streaming_budget': '1',
      'setting.r_lod_switch_scale': '2',
    },
  },
  {
    identifier: 'ultra',
    name: 'apexVideoConfig.options.ultra',
    description: 'apexQuickPreset.graphicsPresets.ultraDesc',
    values: {
      'setting.stream_memory': '3000000',
      'setting.mat_picmip': '0',
      'setting.dynamic_streaming_budget': '1',
      'setting.r_lod_switch_scale': '3',
    },
  },
];

export function findGraphicsQualityPreset(id: string): ApexGraphicsQualityPreset | undefined {
  return graphicsQualityPresets.find((p) => p.identifier === id);
}

/** 快速预设可选启动项(默认全部勾选) */
export const quickPresetLaunchOptionToggles: ApexQuickPresetLaunchOptionToggle[] = [
  {
    key: 'fov_scale',
    label: 'apexLaunchOptions.fov.name',
    identifier: 'fov_scale',
    defaultEnabled: true,
  },
  {
    key: 'show_fps',
    label: 'apexLaunchOptions.showFps.name',
    parameter: '+cl_showfps 1',
    defaultEnabled: true,
  },
  {
    key: 'show_pos',
    label: 'apexLaunchOptions.showPos.name',
    parameter: '+cl_showpos 1',
    defaultEnabled: true,
  },
  {
    key: 'skip_intro_animation',
    label: 'apexLaunchOptions.skipIntro.name',
    identifier: 'skip_intro_animation',
    defaultEnabled: true,
  },
  {
    key: 'red_knockdown',
    label: 'apexLaunchOptions.redKnockdown.name',
    parameter: '+cl_is_softened_locale 1',
    defaultEnabled: true,
  },
];

export function buildDefaultLaunchOptions(): Record<string, boolean> {
  return Object.fromEntries(
    quickPresetLaunchOptionToggles.map((opt) => [opt.key, opt.defaultEnabled]),
  );
}

/** 快速预设可选视频配置开关 */
export const quickPresetVideoConfigToggles: ApexQuickPresetVideoToggle[] = [
  {
    key: 'antialias',
    label: 'apexVideoConfig.matAntialiasMode.name',
    tipIdentifier: 'setting.mat_antialias_mode',
    defaultEnabled: true,
    onValues: { 'setting.mat_antialias_mode': '12' },
  },
  {
    key: 'map_detail_low',
    label: 'apexVideoConfig.mapDetailLevel.name',
    tipIdentifier: 'group.mapDetailLevel',
    defaultEnabled: true,
    onValues: { 'setting.map_detail_level': '1' },
  },
  {
    key: 'reduce_fade_dist_scale',
    label: 'apexQuickPreset.video.reduceFadeDistScale',
    tipIdentifier: 'group.fadeDistScale',
    defaultEnabled: false,
    onValues: { 'setting.fadeDistScale': '1' },
  },
  {
    key: 'texture_filter_aniso16',
    label: 'apexVideoConfig.options.aniso16',
    tipIdentifier: 'group.textureFilter',
    defaultEnabled: true,
    onValues: { 'setting.mat_forceaniso': '16', 'setting.mat_mip_linear': '1' },
  },
  {
    key: 'disable_sun_shadows',
    label: 'apexQuickPreset.video.disableSunShadows',
    tipIdentifier: 'group.csm',
    defaultEnabled: true,
    onValues: { 'setting.csm_enabled': '0', 'setting.csm_coverage': '0' },
  },
  {
    key: 'disable_decals',
    label: 'apexQuickPreset.video.disableDecals',
    tipIdentifier: 'group.decals',
    defaultEnabled: true,
    onValues: { 'setting.r_createmodeldecals': '0', 'setting.r_decals': '0' },
  },
  {
    key: 'disable_volumetric',
    label: 'apexQuickPreset.video.disableVolumetric',
    tipIdentifier: 'setting.volumetric_lighting',
    defaultEnabled: true,
    onValues: { 'setting.volumetric_lighting': '0', 'setting.volumetric_fog': '0' },
  },
  {
    key: 'disable_point_lights',
    label: 'apexQuickPreset.video.disablePointLights',
    tipIdentifier: 'group.shadowDetail',
    defaultEnabled: true,
    onValues: {
      'setting.shadow_enable': '0',
      'setting.shadow_depth_dimen_min': '0',
      'setting.shadow_depth_upres_factor_max': '0',
      'setting.shadow_maxdynamic': '0',
    },
  },
  {
    key: 'disable_ssao',
    label: 'apexQuickPreset.video.disableSsao',
    tipIdentifier: 'group.ssaoQuality',
    defaultEnabled: true,
    onValues: { 'setting.ssao_quality': '0' },
  },
];

export function buildDefaultVideoOptions(): Record<string, boolean> {
  return Object.fromEntries(
    quickPresetVideoConfigToggles.map((opt) => [opt.key, opt.defaultEnabled]),
  );
}
