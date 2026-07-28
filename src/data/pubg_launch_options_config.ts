import {SteamLaunchOptionsImpl} from '@/types/steam.ts';
import {defineAsyncComponent} from 'vue';

const PubgHighPriorityTip = defineAsyncComponent(() =>
  import('@/components/game/pubg/tips/PubgHighPriorityTip.vue'),
);
const PubgUseAllAvailableCoresTip = defineAsyncComponent(() =>
  import('@/components/game/pubg/tips/PubgUseAllAvailableCoresTip.vue'),
);
const PubgMallocSystemTip = defineAsyncComponent(() =>
  import('@/components/game/pubg/tips/PubgMallocSystemTip.vue'),
);
const PubgMaxMemTip = defineAsyncComponent(() =>
  import('@/components/game/pubg/tips/PubgMaxMemTip.vue'),
);
const PubgKoreanRatingTip = defineAsyncComponent(() =>
  import('@/components/game/pubg/tips/PubgKoreanRatingTip.vue'),
);
const PubgMouseInputTip = defineAsyncComponent(() =>
  import('@/components/game/pubg/tips/PubgMouseInputTip.vue'),
);
const PubgGraphicsApiTip = defineAsyncComponent(() =>
  import('@/components/game/pubg/tips/PubgGraphicsApiTip.vue'),
);
const PubgNomanSkyTip = defineAsyncComponent(() =>
  import('@/components/game/pubg/tips/PubgNomanSkyTip.vue'),
);
const PubgRefreshRateTip = defineAsyncComponent(() =>
  import('@/components/game/pubg/tips/PubgRefreshRateTip.vue'),
);
const PubgWindowTip = defineAsyncComponent(() =>
  import('@/components/game/pubg/tips/PubgWindowTip.vue'),
);
const PubgForcedResolutionTip = defineAsyncComponent(() =>
  import('@/components/game/pubg/tips/PubgForcedResolutionTip.vue'),
);
const PubgSkipIntroTip = defineAsyncComponent(() =>
  import('@/components/game/pubg/tips/PubgSkipIntroTip.vue'),
);
const PubgVerboseLogTip = defineAsyncComponent(() =>
  import('@/components/game/pubg/tips/PubgVerboseLogTip.vue'),
);
const PubgNoTextureStreamingTip = defineAsyncComponent(() =>
  import('@/components/game/pubg/tips/PubgNoTextureStreamingTip.vue'),
);
const PubgMatAntialiasTip = defineAsyncComponent(() =>
  import('@/components/game/pubg/tips/PubgMatAntialiasTip.vue'),
);
const PubgViewDistanceScaleTip = defineAsyncComponent(() =>
  import('@/components/game/pubg/tips/PubgViewDistanceScaleTip.vue'),
);
const PubgDepthOfFieldQualityTip = defineAsyncComponent(() =>
  import('@/components/game/pubg/tips/PubgDepthOfFieldQualityTip.vue'),
);

const HighPriority = {
  identifier: 'high_priority',
  name: 'pubgLaunchOptions.highPriority.name',
  description: 'pubgLaunchOptions.highPriority.description',
  parameter: '-high',
  tip: PubgHighPriorityTip,
};
const UseAllAvailableCores = {
  identifier: 'use_all_available_cores',
  name: 'pubgLaunchOptions.useAllCores.name',
  description: 'pubgLaunchOptions.useAllCores.description',
  parameter: '-USEALLAVAILABLECORES',
  tip: PubgUseAllAvailableCoresTip,
};
const Malloc = {
  identifier: 'malloc_system',
  name: 'pubgLaunchOptions.malloc.name',
  description: 'pubgLaunchOptions.malloc.description',
  parameter: '-malloc=system',
  tip: PubgMallocSystemTip,
};
const MaxMem = {
  identifier: 'max_mem',
  name: 'pubgLaunchOptions.maxMem.name',
  description: 'pubgLaunchOptions.maxMem.description',
  parameter: '-maxMem=X',
  tip: PubgMaxMemTip,
};
const KoreanRating = {
  identifier: 'korean_rating',
  name: 'pubgLaunchOptions.koreanRating.name',
  description: 'pubgLaunchOptions.koreanRating.description',
  parameter: ['-koreanrating', '-KoreanRating'],
  default_parameter: '-koreanrating',
  tip: PubgKoreanRatingTip,
};

const MouseInput = {
  identifier: 'mouse_input',
  name: 'pubgLaunchOptions.mouseInput.name',
  description: 'pubgLaunchOptions.mouseInput.description',
  is_combination_parameters: true,
  parameters: [
    {
      name: 'pubgLaunchOptions.mouseInput.speed',
      parameter: '-m_mousespeed 0',
    },
    {
      name: 'pubgLaunchOptions.mouseInput.accel1',
      parameter: '-m_mouseaccel1 0',
    },
    {
      name: 'pubgLaunchOptions.mouseInput.accel2',
      parameter: '-m_mouseaccel2 0',
    },
  ],
  tip: PubgMouseInputTip,
};

const GraphicsApi = {
  identifier: 'graphics_api',
  name: 'pubgLaunchOptions.graphicsApi.name',
  description: 'pubgLaunchOptions.graphicsApi.description',
  parameters: [
    {
      identifier: 'dx9',
      name: 'pubgLaunchOptions.graphicsApi.dx9',
      parameter: '-dx9',
    },
    {
      identifier: 'dx10',
      name: 'pubgLaunchOptions.graphicsApi.dx10',
      parameter: ['-sm4', '-d3d10', '-dx10'],
      default_parameter: '-sm4',
    },
    {
      identifier: 'dx11',
      name: 'pubgLaunchOptions.graphicsApi.dx11',
      parameter: ['-force-feature-level-11-0', '-dx11'],
      default_parameter: '-dx11'
    },
    {
      identifier: 'dx12',
      name: 'pubgLaunchOptions.graphicsApi.dx12',
      parameter: ['-d3d12', '-dx12'],
      default_parameter: '-dx12',
    },
  ],
  tip: PubgGraphicsApiTip,
};

export const NomanSky = {
  identifier: 'nomansky',
  name: 'pubgLaunchOptions.nomanSky.name',
  description: 'pubgLaunchOptions.nomanSky.description',
  parameter: '-nomansky',
  tip: PubgNomanSkyTip,
};

const Refresh = {
  identifier: 'refresh_rate',
  name: 'pubgLaunchOptions.refresh.name',
  description: 'pubgLaunchOptions.refresh.description',
  parameter: '-refresh X',
  tip: PubgRefreshRateTip,
};

const Window = {
  identifier: 'window',
  name: 'pubgLaunchOptions.window.name',
  description: 'pubgLaunchOptions.window.description',
  parameters: [
    {
      name: 'pubgLaunchOptions.window.fullscreen',
      parameter: '-fullscreen',
    },
    {
      name: 'pubgLaunchOptions.window.windowed',
      parameter: '-window',
    },
    {
      name: 'pubgLaunchOptions.window.borderless',
      parameter: '-noborder',
    },
  ],
  tip: PubgWindowTip,
};

const Res = {
  identifier: 'forced_resolution',
  name: 'pubgLaunchOptions.resolution.name',
  description: 'pubgLaunchOptions.resolution.description',
  parameter: '-ResX=W -ResY=H',
  tip: PubgForcedResolutionTip,
};

const Skip = {
  identifier: 'skip_intro',
  name: 'pubgLaunchOptions.skipIntro.name',
  description: 'pubgLaunchOptions.skipIntro.description',
  default_parameter: '-nosplash',
  parameter: ['+noIntroCinematics', '-nosplash'],
  tip: PubgSkipIntroTip,
};

const Log = {
  identifier: 'verbose_log',
  name: 'pubgLaunchOptions.verboseLog.name',
  description: 'pubgLaunchOptions.verboseLog.description',
  parameter: '-log',
  tip: PubgVerboseLogTip,
};

const NoTextureStreaming = {
  identifier: 'no_texture_streaming',
  name: 'pubgLaunchOptions.noTextureStreaming.name',
  description: 'pubgLaunchOptions.noTextureStreaming.description',
  parameter: '-notexturestreaming',
  tip: PubgNoTextureStreamingTip,
};

const MatAntialias = {
  identifier: 'mat_antialias',
  name: 'pubgLaunchOptions.matAntialias.name',
  description: 'pubgLaunchOptions.matAntialias.description',
  parameter: '+mat_antialias 0',
  tip: PubgMatAntialiasTip,
};

export const ViewDistanceScale = {
  identifier: 'view_distance_scale',
  name: 'pubgLaunchOptions.viewDistanceScale.name',
  description: 'pubgLaunchOptions.viewDistanceScale.description',
  parameter: '+r.ViewDistanceScale=X',
  tip: PubgViewDistanceScaleTip,
};

export const DepthOfFieldQuality = {
  identifier: 'depth_of_field_quality',
  name: 'pubgLaunchOptions.depthOfField.name',
  description: 'pubgLaunchOptions.depthOfField.description',
  parameter: '+r.DepthOfFieldQuality=0',
  tip: PubgDepthOfFieldQualityTip,
};

/** 分类标题为 i18n key；项顺序：系统与进程 → 图形与显示 → 启动与调试 → 渲染与画质 */
const PubgLaunchOptionsConfig: (SteamLaunchOptionsImpl | string)[] = [
  'pubgLaunchOptions.categories.display',
  Refresh,
  Window,
  Res,
  // NomanSky,
  GraphicsApi,
  'pubgLaunchOptions.categories.system',
  HighPriority,
  UseAllAvailableCores,
  Malloc,
  MaxMem,
  KoreanRating,
  MouseInput,
  'pubgLaunchOptions.categories.startup',
  Skip,
  Log,
  'pubgLaunchOptions.categories.render',
  NoTextureStreaming,
  MatAntialias,
  // ViewDistanceScale, // 没用?
  // DepthOfFieldQuality, // 没用?
];

export default PubgLaunchOptionsConfig;
