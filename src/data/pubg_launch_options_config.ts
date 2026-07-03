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
  name: '高优先级',
  description: '强制游戏以高处理优先级启动',
  parameter: '-high',
  tip: PubgHighPriorityTip,
};
const UseAllAvailableCores = {
  identifier: 'use_all_available_cores',
  name: '使用所有核心',
  description: '强制游戏使用所有核心',
  parameter: '-USEALLAVAILABLECORES',
  tip: PubgUseAllAvailableCoresTip,
};
const Malloc = {
  identifier: 'malloc_system',
  name: '使用系统内存分配',
  description: '改用系统内存分配器(而非游戏自带),减少内存泄漏与卡顿',
  parameter: '-malloc=system',
  tip: PubgMallocSystemTip,
};
const MaxMem = {
  identifier: 'max_mem',
  name: '最大内存',
  description: '设置最大内存',
  parameter: '-maxMem=X',
  tip: PubgMaxMemTip,
};
const KoreanRating = {
  identifier: 'korean_rating',
  name: '韩国评级',
  description: '韩国评级',
  parameter: ['-koreanrating', '-KoreanRating'],
  default_parameter: '-koreanrating',
  tip: PubgKoreanRatingTip,
};

const MouseInput = {
  identifier: 'mouse_input',
  name: '鼠标输入优化',
  description: '关闭鼠标加速并固定鼠标速度',
  is_combination_parameters: true,
  parameters: [
    {
      name: '鼠标速度',
      parameter: '-m_mousespeed 0',
    },
    {
      name: '鼠标加速1',
      parameter: '-m_mouseaccel1 0',
    },
    {
      name: '鼠标加速2',
      parameter: '-m_mouseaccel2 0',
    },
  ],
  tip: PubgMouseInputTip,
};

const GraphicsApi = {
  identifier: 'graphics_api',
  name: '图形 API (DirectX)',
  description:
    'DX10：SM4 / 降低画质；DX11：限制特性级 11.0；DX12：`-d3d12`',
  parameters: [
    {
      identifier: 'dx9',
      name: 'DX9',
      parameter: '-dx9',
    },
    {
      identifier: 'dx10',
      name: 'DX10',
      parameter: ['-sm4', '-d3d10', '-dx10'],
      default_parameter: '-sm4',
    },
    {
      identifier: 'dx11',
      name: 'DX11',
      parameter: ['-force-feature-level-11-0', '-dx11'],
      default_parameter: '-dx11'
    },
    {
      identifier: 'dx12',
      name: 'DX12',
      parameter: ['-d3d12', '-dx12'],
      default_parameter: '-dx12',
    },
  ],
  tip: PubgGraphicsApiTip,
};

export const NomanSky = {
  identifier: 'nomansky',
  name: '简化天空渲染,减少 GPU 负载',
  description: '显卡弱、天空区域掉帧',
  parameter: '-nomansky',
  tip: PubgNomanSkyTip,
};

const Refresh = {
  identifier: 'refresh_rate',
  name: 'Fps',
  description: '强制游戏使用指定刷新率',
  parameter: '-refresh X',
  tip: PubgRefreshRateTip,
};

const Window = {
  identifier: 'window',
  name: '窗口',
  description: '设置启动窗口方式',
  parameters: [
    {
      name: '全屏模式',
      parameter: '-fullscreen',
    },
    {
      name: '窗口模式',
      parameter: '-window',
    },
    {
      name: '无边框模式',
      parameter: '-noborder',
    },
  ],
  tip: PubgWindowTip,
};

const Res = {
  identifier: 'forced_resolution',
  name: '分辨率',
  description: '强制分辨率',
  parameter: '-ResX=W -ResY=H',
  tip: PubgForcedResolutionTip,
};

const Skip = {
  identifier: 'skip_intro',
  name: '跳过开场动画',
  description: '节省~5s加载时间',
  default_parameter: '-nosplash',
  parameter: ['+noIntroCinematics', '-nosplash'],
  tip: PubgSkipIntroTip,
};

const Log = {
  identifier: 'verbose_log',
  name: '生成详细日志文件(TslGame/Saved/Logs)',
  description: '排查闪退、崩溃、报错',
  parameter: '-log',
  tip: PubgVerboseLogTip,
};

const NoTextureStreaming = {
  identifier: 'no_texture_streaming',
  name: '禁用纹理流送(预加载全部纹理)',
  description: '解决纹理加载慢、远处模糊的问题',
  parameter: '-notexturestreaming',
  tip: PubgNoTextureStreamingTip,
};

const MatAntialias = {
  identifier: 'mat_antialias',
  name: '关闭抗锯齿(提升 FPS)',
  description: '极致性能、低配,那么代价呢',
  parameter: '+mat_antialias 0',
  tip: PubgMatAntialiasTip,
};

export const ViewDistanceScale = {
  identifier: 'view_distance_scale',
  name: '降低视距渲染比例(0.5–1.0)',
  description: '可以解决视距过高导致的掉帧问题',
  parameter: '+r.ViewDistanceScale=X',
  tip: PubgViewDistanceScaleTip,
};

export const DepthOfFieldQuality = {
  identifier: 'depth_of_field_quality',
  name: '关闭景深效果',
  description: '提升流畅度、减少模糊',
  parameter: '+r.DepthOfFieldQuality=0',
  tip: PubgDepthOfFieldQualityTip,
};

/** 分类标题为字面量字符串；项顺序：系统与进程 → 图形与显示 → 启动与调试 → 渲染与画质 */
const PubgLaunchOptionsConfig: (SteamLaunchOptionsImpl | string)[] = [
  '图形与显示',
  Refresh,
  Window,
  Res,
  // NomanSky,
  GraphicsApi,
  '系统与进程',
  HighPriority,
  UseAllAvailableCores,
  Malloc,
  MaxMem,
  KoreanRating,
  MouseInput,
  '启动与调试',
  Skip,
  Log,
  '渲染与画质',
  NoTextureStreaming,
  MatAntialias,
  // ViewDistanceScale, // 没用?
  // DepthOfFieldQuality, // 没用?
];

export default PubgLaunchOptionsConfig;
