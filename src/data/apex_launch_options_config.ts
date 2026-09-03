import {SteamLaunchOptionsImpl} from '@/types/steam.ts';
import {defineAsyncComponent} from 'vue';

const ApexMilesLanguageTip = defineAsyncComponent(() =>
  import('@/components/game/apex/launch/tips/ApexMilesLanguageTip.vue'),
);
const ApexSkipAnimationTip = defineAsyncComponent(() =>
  import('@/components/game/apex/launch/tips/ApexSkipAnimationTip.vue'),
);
const ApexHighPriorityTip = defineAsyncComponent(() =>
  import('@/components/game/apex/launch/tips/ApexHighPriorityTip.vue'),
);
const ApexWindowTip = defineAsyncComponent(() =>
  import('@/components/game/apex/launch/tips/ApexWindowTip.vue'),
);
const ApexFpsTip = defineAsyncComponent(() =>
  import('@/components/game/apex/launch/tips/ApexFpsTip.vue'),
);
const ApexShowFpsTip = defineAsyncComponent(() =>
  import('@/components/game/apex/launch/tips/ApexShowFpsTip.vue'),
);
const ApexShowPosTip = defineAsyncComponent(() =>
  import('@/components/game/apex/launch/tips/ApexShowPosTip.vue'),
);
const ApexFovTip = defineAsyncComponent(() =>
  import('@/components/game/apex/launch/tips/ApexFovTip.vue'),
);
const ApexRedHitTip = defineAsyncComponent(() =>
  import('@/components/game/apex/launch/tips/ApexRedHitTip.vue'),
);
const ApexInputLatencyTip = defineAsyncComponent(() =>
  import('@/components/game/apex/launch/tips/ApexInputLatencyTip.vue'),
);
const ApexForcedResolutionTip = defineAsyncComponent(() =>
  import('@/components/game/apex/launch/tips/ApexForcedResolutionTip.vue'),
);
const ApexLobbyFpsTip = defineAsyncComponent(() =>
  import('@/components/game/apex/launch/tips/ApexLobbyFpsTip.vue'),
);
const ApexAspectTip = defineAsyncComponent(() =>
  import('@/components/game/apex/launch/tips/ApexAspectTip.vue'),
);
const ApexAltTabMinimizeTip = defineAsyncComponent(() =>
  import('@/components/game/apex/launch/tips/ApexAltTabMinimizeTip.vue'),
);
const ApexReticleColorTip = defineAsyncComponent(() =>
  import('@/components/game/apex/launch/tips/ApexReticleColorTip.vue'),
);
const ApexNoJoyTip = defineAsyncComponent(() =>
  import('@/components/game/apex/launch/tips/ApexNoJoyTip.vue'),
);
const ApexMilesChannelsTip = defineAsyncComponent(() =>
  import('@/components/game/apex/launch/tips/ApexMilesChannelsTip.vue'),
);

// 以下启动项已从当前游戏构建(R5pc_r5-300_J57,2026-08)实测确认失效,不再收录:
// +m_rawinput / -noforcemaccel / -noforcemspd / -noforcemparms(原始输入已恒为开)
// -forcenovsync、+cl_ragdoll_collide、-limitvsconst、+cl_forcepreload / -preload、
// +mat_queue_mode、-allow_thrid_party_software、-freq
// -anticheat_settings=SettingsDX11/12.json(DX11 已移除,EAC 仅余 Settings.json)
// 逐项核实记录见 docs/CHANGELOG.md。

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
  parameter: ['-novid', '-dev'],
  identifier: 'skip_intro_animation',
  is_combination_parameters: true,
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
  name: 'apexVideoConfig.windowMode.name',
  description: 'apexVideoConfig.windowMode.description',
  identifier: 'window',
  hide_in_normal_filter: true,
  parameters: [
    {
      name: 'apexVideoConfig.windowMode.fullscreen',
      parameter: '-fullscreen'
    },
    {
      name: 'apexVideoConfig.windowMode.windowed',
      parameter: '-window'
    },
    {
      name: 'apexVideoConfig.windowMode.borderless',
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
  tip: ApexForcedResolutionTip,
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
      default_parameter: '+fps_max X',
      requirement: ['-window', '-noborder'],
      requirement_description: 'apexLaunchOptions.fps.capRequirementDesc',
      parameter: '+fps_max X'
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
const SoftenedLocale = {
  name: 'apexLaunchOptions.redKnockdown.name',
  parameter: '+cl_is_softened_locale 1',
  description: 'apexLaunchOptions.redKnockdown.description',
  tip: ApexRedHitTip,
};

/**
 * Apex启动项配置参数
 * 已核对构建:R5pc_r5-300_J57_CL11457258_2026_08_19_15_40(gameversion v3.0.4.57)
 * 失效项清单与核实记录见 docs/CHANGELOG.md
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
  'apexLaunchOptions.categories.performance',
  FPS,
  LobbyFps,
  HighPriority,
  'apexLaunchOptions.categories.localeExperience',
  ApexSkip,
  MilesChannels,
  ApexMilesLanguages,
  SoftenedLocale,
  'apexLaunchOptions.categories.input',
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
