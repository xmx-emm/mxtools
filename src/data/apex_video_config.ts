import type {ApexVideoConfigImpl} from '@/types/apex.ts';
import {defineAsyncComponent} from 'vue';

const ApexWindowTip = defineAsyncComponent(() =>
  import('@/components/game/apex/launch/tips/ApexWindowTip.vue'),
);
const ApexVideoResolutionTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoResolutionTip.vue'),
);
const ApexVideoLastDisplayTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoLastDisplayTip.vue'),
);
const ApexVideoMatVsyncModeTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoMatVsyncModeTip.vue'),
);
const ApexVideoMatAntialiasModeTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoMatAntialiasModeTip.vue'),
);
const ApexVideoGammaTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoGammaTip.vue'),
);
const ApexVideoDvsTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoDvsTip.vue'),
);
const ApexVideoModelDetailTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoModelDetailTip.vue'),
);
const ApexVideoTextureQualityTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoTextureQualityTip.vue'),
);
const ApexVideoTextureFilterTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoTextureFilterTip.vue'),
);
const ApexVideoMapDetailLevelTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoMapDetailLevelTip.vue'),
);
const ApexVideoDecalsTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoDecalsTip.vue'),
);
const ApexVideoCsmTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoCsmTip.vue'),
);
const ApexVideoShadowDetailTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoShadowDetailTip.vue'),
);
const ApexVideoVolumetricLightingTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoVolumetricLightingTip.vue'),
);
const ApexVideoVolumetricFogTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoVolumetricFogTip.vue'),
);
const ApexVideoNewShadowSettingsTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoNewShadowSettingsTip.vue'),
);
const ApexVideoSsaoQualityTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoSsaoQualityTip.vue'),
);
const ApexVideoMatDepthfeatherEnableTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoMatDepthfeatherEnableTip.vue'),
);
const ApexVideoFadeDistScaleTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoFadeDistScaleTip.vue'),
);
const ApexVideoParticleDetailTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoParticleDetailTip.vue'),
);
const ApexVideoRagdollTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoRagdollTip.vue'),
);
const ApexVideoClRagdollSelfCollisionTip = defineAsyncComponent(() =>
  import('@/components/game/apex/video_config/tips/ApexVideoClRagdollSelfCollisionTip.vue'),
);

/**
 * Apex videoconfig.txt 画面配置
 * 键名对应 `Saved Games/Respawn/Apex/local/videoconfig.txt` 中 setting.*
 * 关联的多键设置合并为 valueType: 'enum'，界面用分段按钮展示档位；
 * 底层 key 在“单独输入”模式下额外展开供手动调。
 * setting.configversion 不收录(由游戏维护)。
 */
const ApexVideoConfig: (ApexVideoConfigImpl | string)[] = [
  'apexVideoConfig.categories.display',
  // 窗口模式：全屏 fullscreen+nowindowborder 均 1；窗口均 0；无边框 nowindowborder 1
  {
    identifier: 'group.windowMode',
    name: 'apexVideoConfig.windowMode.name',
    description: 'apexVideoConfig.windowMode.description',
    valueType: 'enum',
    tip: ApexWindowTip,
    options: [
      {
        label: 'apexVideoConfig.windowMode.fullscreen',
        values: { 'setting.fullscreen': '1', 'setting.nowindowborder': '1' },
      },
      {
        label: 'apexVideoConfig.windowMode.windowed',
        values: { 'setting.fullscreen': '0', 'setting.nowindowborder': '0' },
      },
      {
        label: 'apexVideoConfig.windowMode.borderless',
        values: { 'setting.fullscreen': '0', 'setting.nowindowborder': '1' },
      },
    ],
    fields: [
      { identifier: 'setting.fullscreen', valueType: 'boolean' },
      { identifier: 'setting.nowindowborder', valueType: 'boolean' },
    ],
  },
  {
    identifier: 'group.resolution',
    name: 'apexVideoConfig.resolution.name',
    description: 'apexVideoConfig.resolution.description',
    tip: ApexVideoResolutionTip,
    fields: [
      {
        identifier: 'setting.defaultres',
        valueType: 'integer',
        min: 512,
        max: 7680,
        step: 1,
        inlineLabel: 'apexLaunchOptions.ui.widthLabel',
      },
      {
        identifier: 'setting.defaultresheight',
        valueType: 'integer',
        min: 128,
        max: 4320,
        step: 1,
        inlineLabel: 'apexLaunchOptions.ui.heightLabel',
      },
    ],
    keep_inline_on_individual_input: true,
  },
  {
    identifier: 'group.lastDisplay',
    name: 'apexVideoConfig.lastDisplay.name',
    description: 'apexVideoConfig.lastDisplay.description',
    tip: ApexVideoLastDisplayTip,
    fields: [
      {
        identifier: 'setting.last_display_width',
        valueType: 'integer',
        min: 512,
        max: 7680,
        step: 1,
        inlineLabel: 'apexLaunchOptions.ui.widthLabel',
      },
      {
        identifier: 'setting.last_display_height',
        valueType: 'integer',
        min: 128,
        max: 4320,
        step: 1,
        inlineLabel: 'apexLaunchOptions.ui.heightLabel',
      },
    ],
    hide_in_normal_filter: true,
    keep_inline_on_individual_input: true,
    not_in_game_settings: true,
  },

  // 垂直同步 + 后缓冲：mat_backbuffer_count 随 mat_vsync_mode 联动
  // 0 禁用 → backbuffer 1 / 1 双缓冲(需 DVS 帧率目标 0) → 1 / 2 三重缓冲 → 2 / 3 自适应 → 1 / 4 自适应半刷新率 → 1
  {
    identifier: 'setting.mat_vsync_mode',
    name: 'apexVideoConfig.matVsyncMode.name',
    description: 'apexVideoConfig.matVsyncMode.description',
    valueType: 'enum',
    tip: ApexVideoMatVsyncModeTip,
    options: [
      {
        label: 'apexVideoConfig.options.disabled',
        values: { 'setting.mat_vsync_mode': '0', 'setting.mat_backbuffer_count': '1' },
      },
      {
        label: 'apexVideoConfig.options.doubleBuffer',
        values: { 'setting.mat_vsync_mode': '1', 'setting.mat_backbuffer_count': '1' },
      },
      {
        label: 'apexVideoConfig.options.tripleBuffer',
        values: { 'setting.mat_vsync_mode': '2', 'setting.mat_backbuffer_count': '2' },
      },
      {
        label: 'apexVideoConfig.options.adaptive',
        values: { 'setting.mat_vsync_mode': '3', 'setting.mat_backbuffer_count': '1' },
      },
      {
        label: 'apexVideoConfig.options.adaptiveHalf',
        values: { 'setting.mat_vsync_mode': '4', 'setting.mat_backbuffer_count': '1' },
      },
    ],
    fields: [
      {
        identifier: 'setting.mat_vsync_mode',
        valueType: 'integer',
        min: 0,
        max: 4,
        step: 1,
        hide_in_linked_panel: true,
      },
      {
        identifier: 'setting.mat_backbuffer_count',
        valueType: 'integer',
        min: 1,
        max: 2,
        step: 1,
        hide_in_linked_panel: true,
      },
    ],
  },

  // 抗锯齿：开启=12(TSAA)，关闭=0
  {
    identifier: 'setting.mat_antialias_mode',
    name: 'apexVideoConfig.matAntialiasMode.name',
    description: 'apexVideoConfig.matAntialiasMode.description',
    valueType: 'boolean',
    tip: ApexVideoMatAntialiasModeTip,
    onValue: '12',
    offValue: '0',
  },

  {
    identifier: 'setting.gamma',
    name: 'apexVideoConfig.gamma.name',
    description: 'apexVideoConfig.gamma.description',
    hide_in_normal_filter: true,
    valueType: 'float',
    uiType: 'brightness',
    tip: ApexVideoGammaTip,
    min: 0.5,
    max: 3,
    step: 0.05,
  },

  // 自适应分辨率：开关 + 帧时间上下限/超采样(与 mat_vsync_mode 双缓冲存在依赖，暂无确切档位映射)
  // 0   "setting.dvs_enable"		"0"  "setting.dvs_gpuframetime_min"		"38000"  "setting.dvs_gpuframetime_max"		"39200"
  // 2  "setting.dvs_enable"		"1"  "setting.dvs_gpuframetime_min"		"475000"  "setting.dvs_gpuframetime_max"		"490000"
  // 10   "setting.dvs_enable"		"1"  "setting.dvs_gpuframetime_min"		"95000"  "setting.dvs_gpuframetime_max"		"98000"
  // 25   "setting.dvs_enable"		"1"  "setting.dvs_gpuframetime_min"		"38000"  "setting.dvs_gpuframetime_max"		"39200"
  // 50  "setting.dvs_enable"		"1"  "setting.dvs_gpuframetime_min"		"19000"  "setting.dvs_gpuframetime_max"		"19600"
  // 75   "setting.dvs_enable"		"1"  "setting.dvs_gpuframetime_min"		"12668"  "setting.dvs_gpuframetime_max"		"13067"
  // 100   "setting.dvs_enable"		"1"  "setting.dvs_gpuframetime_min"		"9500"  "setting.dvs_gpuframetime_max"		"9800"
  {
    identifier: 'group.dvs',
    name: 'apexVideoConfig.dvs.name',
    description: 'apexVideoConfig.dvs.description',
    uiType: 'dvsFpsTarget',
    tip: ApexVideoDvsTip,
    fields: [
      {
        identifier: 'setting.dvs_enable',
        valueType: 'boolean',
        hide_in_linked_panel: true,
      },
      {
        identifier: 'setting.dvs_gpuframetime_min',
        valueType: 'integer',
        min: 0,
        max: 500000,
        step: 100,
        hide_in_linked_panel: true,
      },
      {
        identifier: 'setting.dvs_gpuframetime_max',
        valueType: 'integer',
        min: 0,
        max: 500000,
        step: 100,
        hide_in_linked_panel: true,
      },
      {
        identifier: 'setting.dvs_supersample_enable',
        valueType: 'boolean',
        hide_in_normal_filter: true,
      },
    ],
  },

  'apexVideoConfig.categories.texture',

  // 模型细节：r_lod_switch_scale 低 0.6 / 中 0.8 / 高 1 / 非常高 2
  {
    identifier: 'group.modelDetail',
    name: 'apexVideoConfig.modelDetail.name',
    description: 'apexVideoConfig.modelDetail.description',
    valueType: 'enum',
    tip: ApexVideoModelDetailTip,
    options: [
      { label: '关', values: { 'setting.r_lod_switch_scale': '0' }, outOfPreset: true },
      { label: '超低', values: { 'setting.r_lod_switch_scale': '0.1' }, outOfPreset: true },
      { label: '很低', values: { 'setting.r_lod_switch_scale': '0.3' }, outOfPreset: true },
      { label: 'apexVideoConfig.options.low', values: { 'setting.r_lod_switch_scale': '0.6' } },
      { label: 'apexVideoConfig.options.medium', values: { 'setting.r_lod_switch_scale': '0.8' } },
      { label: 'apexVideoConfig.options.high', values: { 'setting.r_lod_switch_scale': '1' } },
      { label: 'apexVideoConfig.options.veryHigh', values: { 'setting.r_lod_switch_scale': '2' } },
      { label: '超高', values: { 'setting.r_lod_switch_scale': '3' }, outOfPreset: true },
    ],
    fields: [
      { identifier: 'setting.r_lod_switch_scale', valueType: 'float', min: 0, max: 4, step: 0.05 },
    ],
  },

  // 淡出距离缩放：控制地图小物件提前消失距离，游戏默认 2；0 / 0.1 / 0.5 / 1 为预设外
  {
    identifier: 'group.fadeDistScale',
    name: 'apexVideoConfig.fadeDistScale.name',
    description: 'apexVideoConfig.fadeDistScale.description',
    valueType: 'enum',
    tip: ApexVideoFadeDistScaleTip,
    not_in_game_settings: true,
    options: [
      { label: '0.5', values: { 'setting.fadeDistScale': '0.5' }, outOfPreset: true },
      { label: '1', values: { 'setting.fadeDistScale': '1' }, outOfPreset: true },
      { label: '2', values: { 'setting.fadeDistScale': '2' } },
    ],
    fields: [
      { identifier: 'setting.fadeDistScale', valueType: 'float', min: 0, max: 2, step: 0.05 },
    ],
  },

  // 纹理质量：stream_memory + mat_picmip + dynamic_streaming_budget 联动
  // 无 / 很低 / 低 / 中 / 高 / 很高 / 超高
  {
    identifier: 'group.textureQuality',
    name: 'apexVideoConfig.textureQuality.name',
    description: 'apexVideoConfig.textureQuality.description',
    valueType: 'enum',
    tip: ApexVideoTextureQualityTip,
    options: [
      {
        label: '超糊',
        values: { 'setting.stream_memory': '0', 'setting.mat_picmip': '3', 'setting.dynamic_streaming_budget': '0' },
        outOfPreset: true
      },
      {
        label: '只看得清手模',
        values: { 'setting.stream_memory': '20000', 'setting.mat_picmip': '2', 'setting.dynamic_streaming_budget': '1' },
        outOfPreset: true
      },
      {
        label: 'apexVideoConfig.options.none',
        values: { 'setting.stream_memory': '0', 'setting.mat_picmip': '2', 'setting.dynamic_streaming_budget': '0' }
      },
      {
        label: 'apexVideoConfig.options.veryLow',
        values: {
          'setting.stream_memory': '160000',
          'setting.mat_picmip': '1',
          'setting.dynamic_streaming_budget': '1'
        }
      },
      {
        label: 'apexVideoConfig.options.low',
        values: {
          'setting.stream_memory': '300000',
          'setting.mat_picmip': '0',
          'setting.dynamic_streaming_budget': '1'
        }
      },
      {
        label: 'apexVideoConfig.options.medium',
        values: {
          'setting.stream_memory': '600000',
          'setting.mat_picmip': '0',
          'setting.dynamic_streaming_budget': '1'
        }
      },
      {
        label: 'apexVideoConfig.options.high',
        values: {
          'setting.stream_memory': '1000000',
          'setting.mat_picmip': '0',
          'setting.dynamic_streaming_budget': '1'
        }
      },
      {
        label: '很高',
        values: {
          'setting.stream_memory': '2000000',
          'setting.mat_picmip': '0',
          'setting.dynamic_streaming_budget': '1'
        },
        outOfPreset: true
      },
      {
        label: 'apexVideoConfig.options.ultra',
        values: {
          'setting.stream_memory': '3000000',
          'setting.mat_picmip': '0',
          'setting.dynamic_streaming_budget': '1'
        },
        outOfPreset: true
      },
    ],
    fields: [
      { identifier: 'setting.stream_memory', valueType: 'integer', min: 0, max: 9999999, step: 1000 },
      { identifier: 'setting.mat_picmip', valueType: 'integer', min: 0, max: 4, step: 1 },
      { identifier: 'setting.dynamic_streaming_budget', valueType: 'boolean' },
    ],
  },

  // 纹理过滤：mat_forceaniso + mat_mip_linear 联动
  {
    identifier: 'group.textureFilter',
    name: 'apexVideoConfig.textureFilter.name',
    description: 'apexVideoConfig.textureFilter.description',
    valueType: 'enum',
    tip: ApexVideoTextureFilterTip,
    options: [
      {
        label: 'apexVideoConfig.options.bilinear',
        values: { 'setting.mat_forceaniso': '1', 'setting.mat_mip_linear': '0' }
      },
      {
        label: 'apexVideoConfig.options.trilinear',
        values: { 'setting.mat_forceaniso': '1', 'setting.mat_mip_linear': '1' }
      },
      {
        label: 'apexVideoConfig.options.aniso2',
        values: { 'setting.mat_forceaniso': '2', 'setting.mat_mip_linear': '1' }
      },
      {
        label: 'apexVideoConfig.options.aniso4',
        values: { 'setting.mat_forceaniso': '4', 'setting.mat_mip_linear': '1' }
      },
      {
        label: 'apexVideoConfig.options.aniso8',
        values: { 'setting.mat_forceaniso': '8', 'setting.mat_mip_linear': '1' }
      },
      {
        label: 'apexVideoConfig.options.aniso16',
        values: { 'setting.mat_forceaniso': '16', 'setting.mat_mip_linear': '1' }
      },
    ],
    fields: [
      { identifier: 'setting.mat_forceaniso', valueType: 'integer', min: 0, max: 16, step: 1 },
      { identifier: 'setting.mat_mip_linear', valueType: 'boolean' },
    ],
  },

  // 地图详情：0 超低(预设外) / 低 1 / 高 2
  {
    identifier: 'group.mapDetailLevel',
    name: 'apexVideoConfig.mapDetailLevel.name',
    description: 'apexVideoConfig.mapDetailLevel.description',
    valueType: 'enum',
    tip: ApexVideoMapDetailLevelTip,
    options: [
      { label: 'apexVideoConfig.options.ultraLow0', values: { 'setting.map_detail_level': '0' }, outOfPreset: true }, //实测0 无效?
      { label: 'apexVideoConfig.options.low', values: { 'setting.map_detail_level': '1' } },
      { label: 'apexVideoConfig.options.high', values: { 'setting.map_detail_level': '2' } },
    ],
    fields: [
      { identifier: 'setting.map_detail_level', valueType: 'integer', min: 0, max: 4, step: 1 },
    ],
  },

  // 冲撞痕迹：r_createmodeldecals + r_decals 联动
  {
    identifier: 'group.decals',
    name: 'apexVideoConfig.decals.name',
    description: 'apexVideoConfig.decals.description',
    valueType: 'enum',
    tip: ApexVideoDecalsTip,
    options: [
      {
        label: 'apexVideoConfig.options.disabled',
        values: { 'setting.r_createmodeldecals': '0', 'setting.r_decals': '0' }
      },
      {
        label: 'apexVideoConfig.options.low',
        values: { 'setting.r_createmodeldecals': '1', 'setting.r_decals': '256' }
      },
    ],
    fields: [
      { identifier: 'setting.r_createmodeldecals', valueType: 'boolean' },
      { identifier: 'setting.r_decals', valueType: 'integer', min: 0, max: 512, step: 1 },
    ],
  },

  'apexVideoConfig.categories.lighting',

  // 阳光阴影：开关 + 范围(coverage) + 细节(cascade_res)
  {
    identifier: 'group.csm',
    name: 'apexVideoConfig.csm.name',
    description: 'apexVideoConfig.csm.description',
    uiType: 'csm',
    tip: ApexVideoCsmTip,
    coverageOptions: [
      { label: 'apexVideoConfig.options.disabled', values: { 'setting.csm_coverage': '0' } },
      { label: 'apexVideoConfig.options.low', values: { 'setting.csm_coverage': '1' } },
      { label: 'apexVideoConfig.options.medium', values: { 'setting.csm_coverage': '2' } },
      { label: 'apexVideoConfig.options.high', values: { 'setting.csm_coverage': '3' } },
      { label: 'apexVideoConfig.options.veryHigh', values: { 'setting.csm_coverage': '4' } },
    ],
    options: [
      { label: '128超低', values: { 'setting.csm_cascade_res': '128' }, outOfPreset: true },
      { label: '256很低', values: { 'setting.csm_cascade_res': '256' }, outOfPreset: true },
      { label: 'apexVideoConfig.options.low', values: { 'setting.csm_cascade_res': '512' } },
      { label: 'apexVideoConfig.options.high', values: { 'setting.csm_cascade_res': '1024' } },
    ],
    fields: [
      { identifier: 'setting.csm_enabled', valueType: 'boolean', hide_in_linked_panel: true },
      {
        identifier: 'setting.csm_coverage',
        valueType: 'integer',
        min: 0,
        max: 4,
        step: 1,
        hide_in_linked_panel: true,
      },
      {
        identifier: 'setting.csm_cascade_res',
        valueType: 'integer',
        min: 0,
        max: 4096,
        step: 1,
        hide_in_linked_panel: true,
      },
    ],
  },

  // 点光源阴影细节：shadow_enable + shadow_depth_dimen_min + shadow_depth_upres_factor_max + shadow_maxdynamic 联动
  // 禁用 / 低 / 高 / 非常高 / 超高(低档 shadow_maxdynamic 原表缺失，按 0 处理)
  {
    identifier: 'group.shadowDetail',
    name: 'apexVideoConfig.shadowDetail.name',
    description: 'apexVideoConfig.shadowDetail.description',
    valueType: 'enum',
    tip: ApexVideoShadowDetailTip,
    options: [
      {
        label: 'apexVideoConfig.options.disabled',
        values: {
          'setting.shadow_enable': '0',
          'setting.shadow_depth_dimen_min': '0',
          'setting.shadow_depth_upres_factor_max': '0',
          'setting.shadow_maxdynamic': '0'
        }
      },
      {
        label: 'apexVideoConfig.options.low',
        values: {
          'setting.shadow_enable': '1',
          'setting.shadow_depth_dimen_min': '128',
          'setting.shadow_depth_upres_factor_max': '2',
          'setting.shadow_maxdynamic': '0'
        }
      },
      {
        label: 'apexVideoConfig.options.high',
        values: {
          'setting.shadow_enable': '1',
          'setting.shadow_depth_dimen_min': '256',
          'setting.shadow_depth_upres_factor_max': '2',
          'setting.shadow_maxdynamic': '4'
        }
      },
      {
        label: 'apexVideoConfig.options.veryHigh',
        values: {
          'setting.shadow_enable': '1',
          'setting.shadow_depth_dimen_min': '256',
          'setting.shadow_depth_upres_factor_max': '3',
          'setting.shadow_maxdynamic': '4'
        }
      },
      {
        label: 'apexVideoConfig.options.ultra',
        values: {
          'setting.shadow_enable': '1',
          'setting.shadow_depth_dimen_min': '512',
          'setting.shadow_depth_upres_factor_max': '3',
          'setting.shadow_maxdynamic': '4'
        }
      },
    ],
    fields: [
      { identifier: 'setting.shadow_enable', valueType: 'boolean' },
      {
        identifier: 'setting.shadow_depth_dimen_min',
        valueType: 'integer',
        min: 0,
        max: 4096,
        step: 64,
      },
      {
        identifier: 'setting.shadow_depth_upres_factor_max',
        valueType: 'integer',
        min: 0,
        max: 4,
        step: 1,
      },
      {
        identifier: 'setting.shadow_maxdynamic',
        valueType: 'integer',
        min: 0,
        max: 32,
        step: 1,
      },
    ],
  },
  {
    identifier: 'setting.volumetric_lighting',
    name: 'apexVideoConfig.volumetricLighting.name',
    description: 'apexVideoConfig.volumetricLighting.description',
    valueType: 'boolean',
    tip: ApexVideoVolumetricLightingTip,
  },
  {
    identifier: 'setting.volumetric_fog',
    name: 'apexVideoConfig.volumetricFog.name',
    description: 'apexVideoConfig.volumetricFog.description',
    valueType: 'boolean',
    tip: ApexVideoVolumetricFogTip,
    not_in_game_settings: true,
  },
  {
    identifier: 'setting.new_shadow_settings',
    name: 'apexVideoConfig.newShadowSettings.name',
    description: 'apexVideoConfig.newShadowSettings.description',
    valueType: 'boolean',
    hide_in_normal_filter: true,
    tip: ApexVideoNewShadowSettingsTip,
    not_in_game_settings: true,
  },

  // 环境光遮蔽：关 0 / 低 1 / 中 2 / 高 3 / 超高 4
  {
    identifier: 'group.ssaoQuality',
    name: 'apexVideoConfig.ssaoQuality.name',
    description: 'apexVideoConfig.ssaoQuality.description',
    valueType: 'enum',
    tip: ApexVideoSsaoQualityTip,
    options: [
      { label: 'apexVideoConfig.options.off', values: { 'setting.ssao_quality': '0' } },
      { label: 'apexVideoConfig.options.low', values: { 'setting.ssao_quality': '1' } },
      { label: 'apexVideoConfig.options.medium', values: { 'setting.ssao_quality': '2' } },
      { label: 'apexVideoConfig.options.high', values: { 'setting.ssao_quality': '3' } },
      { label: 'apexVideoConfig.options.ultra', values: { 'setting.ssao_quality': '4' } },
    ],
    fields: [
      { identifier: 'setting.ssao_quality', valueType: 'integer', min: 0, max: 4, step: 1 },
    ],
  },

  'apexVideoConfig.categories.effects',

  {
    identifier: 'setting.mat_depthfeather_enable',
    name: 'apexVideoConfig.matDepthfeatherEnable.name',
    description: 'apexVideoConfig.matDepthfeatherEnable.description',
    valueType: 'boolean',
    tip: ApexVideoMatDepthfeatherEnableTip,
    not_in_game_settings: true,
  },

  // 特效细节：particle_cpu_level + cl_particle_fallback_base + cl_particle_fallback_multiplier 联动
  {
    identifier: 'group.particleDetail',
    name: 'apexVideoConfig.particleDetail.name',
    description: 'apexVideoConfig.particleDetail.description',
    valueType: 'enum',
    tip: ApexVideoParticleDetailTip,
    options: [
      {
        label: '超低',
        values: {
          'setting.particle_cpu_level': '2',
          'setting.cl_particle_fallback_base': '3',
          'setting.cl_particle_fallback_multiplier': '2'
        }, outOfPreset: true
      },
      {
        label: 'apexVideoConfig.options.low',
        values: {
          'setting.particle_cpu_level': '0',
          'setting.cl_particle_fallback_base': '3',
          'setting.cl_particle_fallback_multiplier': '2'
        }
      },
      {
        label: 'apexVideoConfig.options.medium',
        values: {
          'setting.particle_cpu_level': '1',
          'setting.cl_particle_fallback_base': '0',
          'setting.cl_particle_fallback_multiplier': '1.75'
        }
      },
      {
        label: 'apexVideoConfig.options.high',
        values: {
          'setting.particle_cpu_level': '2',
          'setting.cl_particle_fallback_base': '0',
          'setting.cl_particle_fallback_multiplier': '1'
        }
      },
    ],
    fields: [
      { identifier: 'setting.particle_cpu_level', valueType: 'integer', min: 0, max: 4, step: 1 },
      { identifier: 'setting.cl_particle_fallback_base', valueType: 'integer', min: 0, max: 8, step: 1 },
      { identifier: 'setting.cl_particle_fallback_multiplier', valueType: 'float', min: 0, max: 8, step: 0.05 },
    ],
  },

  // 布娃娃系统：cl_gib_allow + cl_ragdoll_maxcount 联动
  {
    identifier: 'group.ragdoll',
    name: 'apexVideoConfig.ragdoll.name',
    description: 'apexVideoConfig.ragdoll.description',
    valueType: 'enum',
    tip: ApexVideoRagdollTip,
    options: [
      {
        label: 'apexVideoConfig.options.low',
        values: { 'setting.cl_gib_allow': '0', 'setting.cl_ragdoll_maxcount': '0' }
      },
      {
        label: 'apexVideoConfig.options.medium',
        values: { 'setting.cl_gib_allow': '0', 'setting.cl_ragdoll_maxcount': '4' }
      },
      {
        label: 'apexVideoConfig.options.high',
        values: { 'setting.cl_gib_allow': '1', 'setting.cl_ragdoll_maxcount': '8' }
      },
    ],
    fields: [
      { identifier: 'setting.cl_gib_allow', valueType: 'boolean' },
      { identifier: 'setting.cl_ragdoll_maxcount', valueType: 'integer', min: 0, max: 32, step: 1 },
    ],
  },
  {
    identifier: 'setting.cl_ragdoll_self_collision',
    name: 'apexVideoConfig.clRagdollSelfCollision.name',
    description: 'apexVideoConfig.clRagdollSelfCollision.description',
    valueType: 'boolean',
    hide_in_normal_filter: true,
    tip: ApexVideoClRagdollSelfCollisionTip,
    not_in_game_settings: true,
  },
];

export default ApexVideoConfig;
