import {SteamLaunchOptionsImpl} from '@/data/steam.ts';
import ApexMilesLanguageTip from '@/components/game/apex/tips/ApexMilesLanguageTip.vue';
import ApexSkipAnimationTip from '@/components/game/apex/tips/ApexSkipAnimationTip.vue';
import ApexHighPriorityTip from '@/components/game/apex/tips/ApexHighPriorityTip.vue';
import ApexWindowTip from '@/components/game/apex/tips/ApexWindowTip.vue';
import ApexFpsTip from '@/components/game/apex/tips/ApexFpsTip.vue';
import ApexShowFpsTip from '@/components/game/apex/tips/ApexShowFpsTip.vue';
import ApexShowPosTip from '@/components/game/apex/tips/ApexShowPosTip.vue';
import ApexFovTip from '@/components/game/apex/tips/ApexFovTip.vue';
import ApexRedHitTip from '@/components/game/apex/tips/ApexRedHitTip.vue';
import ApexInputLatencyTip from '@/components/game/apex/tips/ApexInputLatencyTip.vue';
import ApexForcedResolutionTip from '@/components/game/apex/tips/ApexForcedResolutionTip.vue';
import ApexInputMouseTip from '@/components/game/apex/tips/ApexInputMouseTip.vue';
import ApexLobbyFpsTip from '@/components/game/apex/tips/ApexLobbyFpsTip.vue';
import ApexAspectTip from '@/components/game/apex/tips/ApexAspectTip.vue';
import ApexAltTabMinimizeTip from '@/components/game/apex/tips/ApexAltTabMinimizeTip.vue';
import ApexReticleColorTip from '@/components/game/apex/tips/ApexReticleColorTip.vue';
import ApexForceNoVSyncTip from '@/components/game/apex/tips/ApexForceNoVSyncTip.vue';
import ApexNoJoyTip from '@/components/game/apex/tips/ApexNoJoyTip.vue';
import ApexMatQueueModeTip from '@/components/game/apex/tips/ApexMatQueueModeTip.vue';
import ApexRagdollCollideTip from '@/components/game/apex/tips/ApexRagdollCollideTip.vue';
import ApexDX12Tip from '@/components/game/apex/tips/ApexDX12Tip.vue';
import ApexLimitvsConstTip from '@/components/game/apex/tips/ApexLimitvsConstTip.vue';
import ApexMilesChannelsTip from '@/components/game/apex/tips/ApexMilesChannelsTip.vue';
import ApexForcePreloadTip from '@/components/game/apex/tips/ApexForcePreloadTip.vue';

// -allow_thrid_party_software 这个参数好像没用?

export const MatQueueMode = { //这个启动项已经没用了?
  name: 'apexLaunchOptions.matQueueMode.name',
  identifier: 'mat_queue_mode',
  parameter: '+mat_queue_mode 2',
  description: 'apexLaunchOptions.matQueueMode.description',
  hide_in_normal_filter: true,
  is_new: true,
  tip: ApexMatQueueModeTip,
};

const ApexMilesLanguages = {
  name: 'apexLaunchOptions.milesLanguage.name',
  identifier: 'miles_language',
  description: 'apexLaunchOptions.milesLanguage.description',
  default_parameter: '+miles_language mandarin',
  parameters: [
    {
      name: 'apexLaunchOptions.milesLanguage.mandarin',
      parameter: '+miles_language mandarin'
    },
    {
      name: 'apexLaunchOptions.milesLanguage.english',
      parameter: '+miles_language english'
    },
    {
      name: 'apexLaunchOptions.milesLanguage.japanese',
      parameter: '+miles_language japanese'
    },
    {
      name: 'apexLaunchOptions.milesLanguage.french',
      parameter: '+miles_language french'
    },
    {
      name: 'apexLaunchOptions.milesLanguage.german',
      parameter: '+miles_language german'
    },
    {
      name: 'apexLaunchOptions.milesLanguage.italian',
      parameter: '+miles_language italian'
    },
    {
      name: 'apexLaunchOptions.milesLanguage.korean',
      parameter: '+miles_language korean'
    },
    {
      name: 'apexLaunchOptions.milesLanguage.polish',
      parameter: '+miles_language polish'
    },
    {
      name: 'apexLaunchOptions.milesLanguage.russian',
      parameter: '+miles_language russian'
    },
    {
      name: 'apexLaunchOptions.milesLanguage.spanish',
      parameter: '+miles_language spanish'
    },
  ],
  tip: ApexMilesLanguageTip,
};

const ApexSkip = {
  name: 'apexLaunchOptions.skipIntro.name',
  description: 'apexLaunchOptions.skipIntro.description',
  default_parameter: '-dev',
  parameter: ['-novid', '-dev'],
  tip: ApexSkipAnimationTip,
};
const HighPriority = {
  name: 'apexLaunchOptions.highPriority.name',
  description: 'apexLaunchOptions.highPriority.description',
  parameter: '-high',
  tip: ApexHighPriorityTip,
};
const AltTabMinimize = {
  name: 'apexLaunchOptions.altTabMinimize.name',
  description: 'apexLaunchOptions.altTabMinimize.description',
  parameter: '+mat_minimize_on_alt_tab 1',
  identifier: 'mat_minimize_on_alt_tab',
  hide_in_normal_filter: true,
  is_new: true,
  tip: ApexAltTabMinimizeTip,
};
const Window = {
  name: 'apexLaunchOptions.window.name',
  description: 'apexLaunchOptions.window.description',
  identifier: 'window',
  hide_in_normal_filter: true,
  parameters: [
    {
      name: 'apexLaunchOptions.window.fullscreen',
      parameter: '-fullscreen'
    },
    {
      name: 'apexLaunchOptions.window.windowed',
      parameter: '-window'
    },
    {
      name: 'apexLaunchOptions.window.borderless',
      parameter: '-noborder'
    }
  ],
  tip: ApexWindowTip,
};
const ForcedResolution = {
  name: 'apexLaunchOptions.forcedResolution.name',
  description: 'apexLaunchOptions.forcedResolution.description',
  identifier: 'forced_resolution',
  replace_numbers: true,
  requirement: ['-fullscreen'],
  hide_in_normal_filter: true,
  tip: ApexForcedResolutionTip,
};
const InputMouse = {
  name: 'apexLaunchOptions.inputMouse.name',
  description: 'apexLaunchOptions.inputMouse.description',
  identifier: 'input_mouse',
  is_combination_parameters: true,
  parameters: [
    {
      name: 'apexLaunchOptions.inputMouse.rawInput',
      parameter: '+m_rawinput 1'
    },
    {
      name: 'apexLaunchOptions.inputMouse.noForceAccel',
      parameter: '-noforcemaccel'
    },
    {
      name: 'apexLaunchOptions.inputMouse.noForceSpd',
      parameter: '-noforcemspd'
    },
    {
      name: 'apexLaunchOptions.inputMouse.noForceParms',
      parameter: '-noforcemparms'
    }
  ],
  tip: ApexInputMouseTip,
};
const FPS = {
  name: 'apexLaunchOptions.fps.name',
  description: 'apexLaunchOptions.fps.description',
  identifier: 'fps',
  parameters: [
    {
      name: 'apexLaunchOptions.fps.unlimitedName',
      description: 'apexLaunchOptions.fps.unlimitedDesc',
      parameter: '+fps_max unlimited'
    },
    {
      name: 'apexLaunchOptions.fps.capName',
      description: 'apexLaunchOptions.fps.capDesc',
      replace_numbers: true,
      identifier: 'restriction_fps',
      default_parameter: '-freq X +fps_max X',
      requirement: ['-window', '-noborder'],
      requirement_description: 'apexLaunchOptions.fps.capRequirementDesc',
      parameter: '-freq X +fps_max X'
    }
  ],
  tip: ApexFpsTip,
};
const LobbyFps = {
  name: 'apexLaunchOptions.lobbyFps.name',
  description: 'apexLaunchOptions.lobbyFps.description',
  identifier: 'lobby_max_fps',
  parameter: '+lobby_max_fps X',
  replace_numbers: true,
  tip: ApexLobbyFpsTip,
};
const Aspect = {
  name: 'apexLaunchOptions.aspect.name',
  description: 'apexLaunchOptions.aspect.description',
  identifier: 'letterbox_aspect',
  hide_in_normal_filter: true,
  tip: ApexAspectTip,
};
const ShowFps = {
  name: 'apexLaunchOptions.showFps.name',
  description: 'apexLaunchOptions.showFps.description',
  parameter: '+cl_showfps 1',
  tip: ApexShowFpsTip
};
const ShowPos = {
  name: 'apexLaunchOptions.showPos.name',
  description: 'apexLaunchOptions.showPos.description',
  parameter: '+cl_showpos 1',
  tip: ApexShowPosTip
};
const InputLatency = {
  name: 'apexLaunchOptions.inputLatency.name',
  description: 'apexLaunchOptions.inputLatency.description',
  parameter: '-no_render_on_input_thread',
  tip: ApexInputLatencyTip
};
const Fov = {
  name: 'apexLaunchOptions.fov.name',
  identifier: 'fov_scale',
  parameter: '+cl_fovScale "1.7"',// WARNING: EA是+cl_fovScale 1.7 steam是+cl_fovScale "1.7"
  description: 'apexLaunchOptions.fov.description',
  tip: ApexFovTip
};
const ReticleColor = {
  name: 'apexLaunchOptions.reticleColor.name',
  identifier: 'reticle_color',
  parameter: '+reticle_color "2147483648 2147483648 2147483648"',// WARNING: EA是 +reticle_color 2147483648-2147483648-2147483648 steam是 +reticle_color "2147483648 2147483648 2147483648"
  description: 'apexLaunchOptions.reticleColor.description',
  is_new: true,
  tip: ApexReticleColorTip
};
const ForceNoVSync = {
  name: 'apexLaunchOptions.forceNoVSync.name',
  identifier: 'forcenovsync',
  parameter: '-forcenovsync',
  description: 'apexLaunchOptions.forceNoVSync.description',
  hide_in_normal_filter: true,
  is_new: true,
  tip: ApexForceNoVSyncTip,
};
const NoJoy = {
  name: 'apexLaunchOptions.noJoy.name',
  identifier: 'nojoy',
  parameter: '-nojoy',
  description: 'apexLaunchOptions.noJoy.description',
  hide_in_normal_filter: true,
  is_new: true,
  tip: ApexNoJoyTip,
};
const MilesChannels = {
  name: 'apexLaunchOptions.milesChannels.name',
  identifier: 'miles_channels',
  parameters: [
    {
      name: 'apexLaunchOptions.milesChannels.stereo',
      parameter: '+miles_channels 2'
    },
    {
      name: 'apexLaunchOptions.milesChannels.channel41',
      parameter: '+miles_channels 4'
    },
    {
      name: 'apexLaunchOptions.milesChannels.channel51',
      parameter: '+miles_channels 6'
    },
    {
      name: 'apexLaunchOptions.milesChannels.virtual71',
      parameter: '+miles_channels 8'
    },
  ],
  description: 'apexLaunchOptions.milesChannels.description',
  hide_in_normal_filter: true,
  is_new: true,
  tip: ApexMilesChannelsTip,
};
const RagdollCollide = {
  name: 'apexLaunchOptions.ragdollCollide.name',
  identifier: 'cl_ragdoll_collide',
  parameter: '+cl_ragdoll_collide 0',
  description: 'apexLaunchOptions.ragdollCollide.description',
  is_new: true,
  tip: ApexRagdollCollideTip,
};
const GraphicsApi = {
  name: 'apexLaunchOptions.graphicsApi.name',
  identifier: 'graphics_api',
  description: 'apexLaunchOptions.graphicsApi.description',
  default_parameter: '-anticheat_settings=SettingsDX12.json',
  parameters: [
    {
      name: 'apexLaunchOptions.graphicsApi.dx11',
      parameter: '-anticheat_settings=SettingsDX11.json',
    },
    {
      name: 'apexLaunchOptions.graphicsApi.dx12',
      parameter: '-anticheat_settings=SettingsDX12.json',
    },
  ],
  hide_in_normal_filter: true,
  is_new: true,
  tip: ApexDX12Tip,
};
const LimitvsConst = {
  name: 'apexLaunchOptions.limitvsconst.name',
  identifier: 'limitvsconst',
  parameter: '-limitvsconst',
  description: 'apexLaunchOptions.limitvsconst.description',
  hide_in_normal_filter: true,
  is_new: true,
  tip: ApexLimitvsConstTip,
};
const ForcePreload = {
  name: 'apexLaunchOptions.forcePreload.name',
  identifier: 'forcepreload',
  is_combination_parameters: true,
  parameters: [
    {
      name: 'apexLaunchOptions.forcePreload.force',
      parameter: '+cl_forcepreload 1',
    },
    {
      name: 'apexLaunchOptions.forcePreload.preload',
      parameter: '-preload',
    },
  ],
  description: 'apexLaunchOptions.forcePreload.description',
  is_new: true,
  tip: ApexForcePreloadTip,
};
const SoftenedLocale = {
  name: 'apexLaunchOptions.redKnockdown.name',
  parameter: '+cl_is_softened_locale 1',
  description: 'apexLaunchOptions.redKnockdown.description',
  tip: ApexRedHitTip,
};

/**
 * Apex启动项配置参数
 * v3.0.3.15
 * SteamLibrary\steamapps\common\Apex Legends\gameversion.txt
 */
const ApexLaunchOptionsConfig: (SteamLaunchOptionsImpl | string)[] = [
  'apexLaunchOptions.categories.display',
  Window,
  Fov,
  ShowFps,
  ShowPos,
  ReticleColor,
  AltTabMinimize,
  Aspect,
  ForcedResolution,
  // MatQueueMode,
  'apexLaunchOptions.categories.performance',
  FPS,
  LobbyFps,
  HighPriority,
  ForceNoVSync,
  ForcePreload,
  RagdollCollide,
  LimitvsConst,
  GraphicsApi,
  'apexLaunchOptions.categories.localeExperience',
  ApexSkip,
  MilesChannels,
  ApexMilesLanguages,
  SoftenedLocale,
  'apexLaunchOptions.categories.input',
  InputMouse,
  InputLatency,
  NoJoy,
];

const milesIndex = 4;
//常用配音
const ApexCommonMilesLanguages: SteamLaunchOptionsImpl[] = ApexMilesLanguages.parameters.slice(0, milesIndex);
//不常用配音
const ApexUncommonMilesLanguages: SteamLaunchOptionsImpl[] = ApexMilesLanguages.parameters.slice(milesIndex);

//语言对应的depotId,在rust里面也存了一份,从rust里拿需要异步,在这边也复制一份来
const ApexMilesLanguagesDepot = <{ [key: string]: string }>{
  'french': '1172472',
  '"french"': '1172472',
  'French': '1172472',
  'german': '1172473',
  'italian': '1172474',
  'japanese': '1172475',
  'koreana': '1172476',
  'korean': '1172476',
  'polish': '1172478',
  'russian': '1172479',
  'schinese': '1172477',
  'mandarin': '1172477',
  'spanish': '1311105',
};

export default ApexLaunchOptionsConfig;

export {
  ApexMilesLanguages,
  ApexCommonMilesLanguages,
  ApexUncommonMilesLanguages,
  ApexMilesLanguagesDepot,
};
