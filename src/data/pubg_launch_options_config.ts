import {SteamLaunchOptionsImpl} from '@/data/steam.ts';

const HighPriority = {
  identifier: 'high_priority',
  name: '高优先级',
  description: '强制游戏以高处理优先级启动',
  parameter: '-high',
};
const UseAllAvailableCores = {
  identifier: 'use_all_available_cores',
  name: '使用所有核心',
  description: '强制游戏使用所有核心',
  parameter: '-USEALLAVAILABLECORES',
};
const Malloc = {
  identifier: 'malloc_system',
  name: '使用系统内存分配',
  description: '改用系统内存分配器(而非游戏自带),减少内存泄漏与卡顿',
  parameter: '-malloc=system',
};
const MaxMem = {
  identifier: 'max_mem',
  name: '最大内存',
  description: '设置最大内存',
  parameter: '-maxMem=X',
};
const KoreanRating = {
  identifier: 'korean_rating',
  name: '韩国评级',
  description: '韩国评级',
  parameter: ['-koreanrating', '-KoreanRating'],
  default_parameter: '-KoreanRating',
};

const GraphicsApi = {
  identifier: 'graphics_api',
  name: '图形 API (DirectX)',
  description:
    'DirectX 10：SM4 / 降低画质；DirectX 11：限制特性级 11.0；DirectX 12：`-d3d12`',
  parameters: [
    {
      identifier: 'dx9',
      name: 'Dx 9',
      parameter: '-dx9',
    },
    {
      identifier: 'dx10',
      name: 'Dx 10',
      parameter: ['-sm4', '-d3d10', '-dx10'],
      default_parameter: '-sm4',
    },
    {
      identifier: 'dx11',
      name: 'Dx 11',
      parameter: ['-force-feature-level-11-0', '-dx11'],
      default_parameter: '-dx11'
    },
    {
      identifier: 'dx12',
      name: 'Dx 12',
      parameter: ['-d3d12', '-dx12'],
      default_parameter: '-dx12',
    },
  ],
};

const NomanSky = {
  identifier: 'nomansky',
  name: '简化天空渲染,减少 GPU 负载',
  description: '显卡弱、天空区域掉帧',
  parameter: '-nomansky',
};

const Refresh = {
  identifier: 'refresh_rate',
  name: 'Fps',
  description: '强制游戏使用指定刷新率',
  parameter: '-refresh X',
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
};

const Res = {
  identifier: 'forced_resolution',
  name: '分辨率',
  description: '强制分辨率',
  parameter: '-res W H',
};

const Skip = {
  identifier: 'skip_intro',
  name: '跳过开场动画',
  description: '节省~5s加载时间',
  default_parameter: '-nosplash',
  parameter: ['+noIntroCinematics', '-nosplash'],
};

const Log = {
  identifier: 'verbose_log',
  name: '生成详细日志文件(TslGame/Saved/Logs)',
  description: '排查闪退、崩溃、报错',
  parameter: '-log',
};

const NoTextureStreaming = {
  identifier: 'no_texture_streaming',
  name: '禁用纹理流送(预加载全部纹理)',
  description: '解决纹理加载慢、远处模糊的问题',
  parameter: '-notexturestreaming',
};

const MatAntialias = {
  identifier: 'mat_antialias',
  name: '关闭抗锯齿(提升 FPS)',
  description: '极致性能、低配,那么代价呢',
  parameter: '+mat_antialias 0',
};

const ViewDistanceScale = {
  identifier: 'view_distance_scale',
  name: '降低视距渲染比例(0.5–1.0)',
  description: '可以解决视距过高导致的掉帧问题',
  parameter: '+r.ViewDistanceScale=X',
};

const DepthOfFieldQuality = {
  identifier: 'depth_of_field_quality',
  name: '关闭景深效果',
  description: '提升流畅度、减少模糊',
  parameter: '+r.DepthOfFieldQuality=0',
};

/** 分类标题为字面量字符串；项顺序：系统与进程 → 图形与显示 → 启动与调试 → 渲染与画质 */
const PubgLaunchOptionsConfig: (SteamLaunchOptionsImpl | string)[] = [
  '图形与显示',
  Refresh,
  Window,
  Res,
  NomanSky,
  GraphicsApi,
  '系统与进程',
  HighPriority,
  UseAllAvailableCores,
  Malloc,
  MaxMem,
  KoreanRating,
  '启动与调试',
  Skip,
  Log,
  '渲染与画质',
  NoTextureStreaming,
  MatAntialias,
  ViewDistanceScale,
  DepthOfFieldQuality,
];

export default PubgLaunchOptionsConfig;
