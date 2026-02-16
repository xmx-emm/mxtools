import {SteamLaunchOptionsImpl} from "@/data/steam.ts";

/**
 * Pubg启动项配置参数
 * v3.0.3.15
 * SteamLibrary\steamapps\common\Apex Legends\gameversion.txt
 */
const PubgLaunchOptionsConfig: SteamLaunchOptionsImpl[] = [{
    name: '跳过开场动画',
    description: '节省5s加载时间',
    default_parameter: '-dev',
    parameter: ['-novid', '-dev']
}, {
    name: '优先启动',
    description: "强制游戏以高处理优先级启动",
    parameter: '-high'
}, {
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
    ]
}, {
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
            parameter: ["-freq X", "+fps_max X"]
        }
    ]
}, {
    name: '显示详细信息',
    description: "在右上角显示FPS/网络信息",
    parameter: "+cl_showfps 1"
}, {
    name: '显示速度坐标信息',
    description: "在左上角显示玩家的位置/速度信息",
    parameter: "+cl_showpos 1"
}, {
    name: "提高游戏的帧数",
    description: "CPU核心大于等于6个，使用高回报率的外设",
    parameter: "-no_render_on_input_thread"
}, {
    name: "配音",
    description: "仅修改配音不修改界面语言",
    identifier: "miles_language",
    default_parameter: "+miles_language mandarin",
    parameters: [
        {
            name: "中配",
            parameter: "+miles_language mandarin"
        },
        {
            name: "英配",
            parameter: '+miles_language english'
        },
        {
            name: "日配",
            parameter: "+miles_language japanese"
        },
    ]
}, {
    name: "强制120fov",
    parameter: '+cl fovScale "1.7"'
}, {
    name: "红光击倒效果",
    parameter: "+cl_is_softened_locale 1"
}
];

export default PubgLaunchOptionsConfig;