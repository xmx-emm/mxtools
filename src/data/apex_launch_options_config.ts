import {SteamLaunchOptionsImpl} from "@/data/steam.ts";
import ApexMilesLanguageTip from "@/components/game/apex/tips/ApexMilesLanguageTip.vue";
import ApexSkipAnimationTip from "@/components/game/apex/tips/ApexSkipAnimationTip.vue";
import ApexHighPriorityTip from "@/components/game/apex/tips/ApexHighPriorityTip.vue";
import ApexWindowTip from "@/components/game/apex/tips/ApexWindowTip.vue";
import ApexFpsTip from "@/components/game/apex/tips/ApexFpsTip.vue";
import ApexShowFpsTip from "@/components/game/apex/tips/ApexShowFpsTip.vue";
import ApexShowPosTip from "@/components/game/apex/tips/ApexShowPosTip.vue";
import ApexFovTip from "@/components/game/apex/tips/ApexFovTip.vue";
import ApexRedHitTip from "@/components/game/apex/tips/ApexRedHitTip.vue";
import ApexInputLatencyTip from "@/components/game/apex/tips/ApexInputLatencyTip.vue";
import ApexForcedResolutionTip from "@/components/game/apex/tips/ApexForcedResolutionTip.vue";
import ApexInputMouseTip from "@/components/game/apex/tips/ApexInputMouseTip.vue";
import ApexLobbyFpsTip from "@/components/game/apex/tips/ApexLobbyFpsTip.vue";
import ApexAspectTip from "@/components/game/apex/tips/ApexAspectTip.vue";

// TODO +mat_minimize_on_alt_tab 1
// +clip_mouse_to_letterbox0
// -allow_thrid_party_software

const ApexMilesLanguages = {
    name: "配音",
    identifier: "miles_language",
    description: "此选项作用为仅修改配音,不修改UI界面语言",
    default_parameter: "+miles_language mandarin",
    parameters: [
        {
            name: "普通话",
            parameter: "+miles_language mandarin"
        },
        {
            name: "英语",
            parameter: "+miles_language english"
        },
        {
            name: "日语",
            parameter: "+miles_language japanese"
        },
        {
            name: "法语",
            parameter: "+miles_language french"
        },
        {
            name: "德语",
            parameter: "+miles_language german"
        },
        {
            name: "意大利语",
            parameter: "+miles_language italian"
        },
        {
            name: "韩语",
            parameter: "+miles_language korean"
        },
        {
            name: "波兰语",
            parameter: "+miles_language polish"
        },
        {
            name: "俄语",
            parameter: "+miles_language russian"
        },
        {
            name: "西班牙语",
            parameter: "+miles_language spanish"
        },
    ],
    tip: ApexMilesLanguageTip,
}

const ApexSkip = {
    name: '跳过开场动画',
    description: '节省~5s加载时间',
    default_parameter: '-dev',
    parameter: ['-novid', '-dev'],
    tip: ApexSkipAnimationTip,
}
const HighPriority = {
    name: '高优先级',
    description: "强制游戏以高处理优先级启动",
    parameter: '-high',
    tip: ApexHighPriorityTip,
}
const Window = {
    name: '窗口',
    description: '设置启动窗口方式',
    identifier: "window",
    parameters: [
        {
            name: '全屏模式',
            parameter: '-fullscreen'
        },
        {
            name: '窗口模式',
            parameter: '-window'
        },
        {
            name: '无边框模式',
            parameter: '-noborder'
        }
    ],
    tip: ApexWindowTip,
}
const ForcedResolution = {
    name: '强制分辨率',
    description: '强制以设置的分辨率(px)启动游戏',
    identifier: "forced_resolution",
    replace_numbers: true,
    requirement: ['-fullscreen'],
    is_new: true,
    tip: ApexForcedResolutionTip,
}
const InputMouse = {
    name: '优化鼠标',
    description: '这三个参数一起用，就是让游戏完全无视 Windows 系统的鼠标加速、灵敏度设置，保证鼠标移动线性、不飘、不加速，职业玩家 / 打 FPS 必开',
    identifier: "input_mouse",
    is_combination_parameters: true,
    is_new: true,
    parameters: [
        {
            name: '直接读取鼠标硬件信号',
            parameter: '+m_rawinput 1'
        },
        {
            name: '不强制启用鼠标加速度',
            parameter: '-noforcemaccel'
        },
        {
            name: '不强制使用系统鼠标参数',
            parameter: '-noforcemspd'
        },
        {
            name: '不强制使用系统鼠标速度',
            parameter: '-noforcemparms'
        }
    ],
    tip: ApexInputMouseTip,
}
const FPS = {
    name: 'Fps',
    description: '设置Fps',
    identifier: 'fps',
    parameters: [
        {
            name: "无上限",
            description: "去除FPS上限",
            parameter: '+fps_max unlimited'
        },
        {
            name: "锁帧",
            description: "设置上限,将刷新率设定为整数",
            replace_numbers: true,
            identifier: "restriction_fps",
            default_parameter: '+fps_max X',
            requirement: ['-window', '-noborder'],
            requirement_description: "限制Fps只能在窗口或无边框模式下",
            parameter: ["-freq X", "+fps_max X"]
        }
    ],
    tip: ApexFpsTip,
}
const LobbyFps = {
    name: '大厅Fps',
    description: '设置为0则不限制',
    identifier: 'lobby_max_fps',
    parameter: "+lobby_max_fps X",
    replace_numbers: true,
    is_new: true,
    tip: ApexLobbyFpsTip,
}
const Aspect = {
    name: '比例',
    description: '自定义画面比例',
    identifier: 'mat_letterbox_aspect_min',
    parameter: "+mat_letterbox_aspect_min X",
    replace_numbers: true,
    is_new: true,
    tip: ApexAspectTip,
}
const ShowFps = {
    name: '显示详细信息',
    description: "在右上角显示FPS/网络信息",
    parameter: "+cl_showfps 1",
    tip: ApexShowFpsTip
}
const ShowPos = {
    name: '显示速度坐标信息',
    description: "在左上角显示玩家的位置/速度信息",
    parameter: "+cl_showpos 1",
    tip: ApexShowPosTip
}
const InputLatency = {
    name: "降底高回报率外设输入延迟",
    description: "对于CPU核心数≥6并使用高回报率外设的玩家，可以降底输入延迟",
    parameter: "-no_render_on_input_thread",
    tip: ApexInputLatencyTip
}
const Fov = {
    name: "强制120fov",
    parameter: '+cl fovScale "1.7"',
    description: "视图更大,但是可能会晕3D",
    tip: ApexFovTip
}
const SoftenedLocale = {
    name: "红光击倒效果",
    parameter: "+cl_is_softened_locale 1",
    description: "击倒敌人的时候会闪一下红光",
    tip: ApexRedHitTip,
}

/**
 * Apex启动项配置参数
 * v3.0.3.15
 * SteamLibrary\steamapps\common\Apex Legends\gameversion.txt
 */
const ApexLaunchOptionsConfig: (SteamLaunchOptionsImpl | string)[] = [
    "画面与显示",
    Window,
    ForcedResolution,
    Aspect,
    Fov,
    ShowFps,
    ShowPos,
    "性能与帧率",
    FPS,
    LobbyFps,
    HighPriority,
    "语言与体验",
    ApexMilesLanguages,
    ApexSkip,
    SoftenedLocale,
    "操作与输入",
    InputMouse,
    InputLatency,
];

const milesIndex = 4
//常用配音
const ApexCommonMilesLanguages: SteamLaunchOptionsImpl[] = ApexMilesLanguages.parameters.slice(0, milesIndex)
//不常用配音
const ApexUncommonMilesLanguages: SteamLaunchOptionsImpl[] = ApexMilesLanguages.parameters.slice(milesIndex)

//语言对应的depotId,在rust里面也存了一份,从rust里拿需要异步,在这边也复制一份来
const ApexMilesLanguagesDepot = <{ [key: string]: string }>{
    "french": "1172472",
    '"french"': "1172472",
    "French": "1172472",
    "german": "1172473",
    "italian": "1172474",
    "japanese": "1172475",
    "koreana": "1172476",
    "korean": "1172476",
    "polish": "1172478",
    "russian": "1172479",
    "schinese": "1172477",
    "mandarin": "1172477",
    "spanish": "1311105",
}

export default ApexLaunchOptionsConfig;

export {
    ApexMilesLanguages,
    ApexCommonMilesLanguages,
    ApexUncommonMilesLanguages,
    ApexMilesLanguagesDepot,
}