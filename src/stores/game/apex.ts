import {defineStore} from "pinia";
import {invoke} from "@tauri-apps/api/core";
import ApexLaunchOptionsConfig, {
    ApexMilesLanguages,
    ApexMilesLanguagesDepot
} from "@/data/apex_launch_options_config.ts";
import {isSteamLaunchOptionsImpl, SteamLaunchOptionsImpl} from "@/data/steam.ts";
import {useToast} from "vue-toastification";
import {steamStore} from "@/stores/game/steam.ts";
import {
    match_apex_fps_by_fps_max,
    match_apex_fps_by_freq,
    match_apex_height,
    match_apex_lobby_max_fps,
    match_apex_mat_letterbox_aspect_min,
    match_apex_width
} from "@/utils/game/apex.ts";
import {Component, markRaw} from "vue";

const apexStore = defineStore("apex", {
    state: () => ({
        //语音包
        download_language_button_color: "info",//下载语音包的按钮颜色
        download_miles_language_semi_automatic_dialog: false,
        download_miles_language_manual_dialog: false, //手动下载

        is_start_loading: false,//从steam加载中
        fps: 320,//锁帧
        lobby_max_fps: 0,//大厅帧数
        mat_letterbox_aspect_min: 1.7778,//比例
        width: 1920,//强制的宽度
        height: 1080,//强制的高度

        options_selection: <SteamLaunchOptionsImpl[]>[],//勾选的项
        settings_config: <{ [key: string]: string | any }>({
            // 这里用来放 parameters 的配置,可多选的内容
            window: "-fullscreen",
            fps: "+fps_max unlimited",
            miles_language: "+miles_language japanese",
        }),//多选项配置

        original_launch_options: "",//从Steam加载后的启动项快照
        is_miles_language_ready: true,//语音包是否就绪

        //提示视图,用来放显示的页面,直接在最上层显示
        tip_view: <Component | null | undefined>null,
        tip_dialog: false
    }),
    actions: {
        //从steam加载启动数据
        async check_miles_language() {
            for (const item of this.options_selection) {
                if (item.identifier === "miles_language") {
                    if (this.language === "english") {//默认语言为英语,不需要下载操作
                        return true
                    }
                    return await invoke<boolean>("check_apex_miles_language", {language: this.language}).then((is_ok) => {
                        console.log("check_apex_miles_language ok", is_ok)
                        return is_ok
                    }).catch((e) => {
                        console.log("check_apex_miles_language err", e)
                        return false
                    });
                }
            }
            return true
        },
        //通过读取对应steam user用户的loadconfig.vdf获取启动参数并解析
        closeTip() {
            this.tip_dialog = false
        },
        //在应用时检查配音文件是否存在,反回是否错误的布尔值
        showTip(item: SteamLaunchOptionsImpl) {
            if (item.tip !== null && item.tip !== undefined) {
                this.tip_view = markRaw(item.tip);
                this.tip_dialog = true
            }
        },
        start_launch() {
            this.is_start_loading = true
            this.options_selection = []
            this.download_miles_language_semi_automatic_dialog = false
            setTimeout(async () => {
                await this.start_load_apex_launch_options_data()
                this.is_start_loading = false;
                this.original_launch_options = this.launch_options
                this.update_download_language_button_color()
            }, 300)
        },
        start_load_apex_launch_options_data: async function () {
            //从参数字符串组合中获取勾选项
            const steam_state = steamStore()
            const user_id = steam_state.active_steam_user?.id
            await invoke<string>("get_apex_launch_option", {
                id: Number(user_id),
            }).then((start_launch_option) => {
                // start_launch_option = "+cl fovScale \"1.7\" +cl_is_softened_locale 1 +cl_showfps 1 +cl_showpos 1 +fps_max unlimited +miles_language english -dev -high -no_render_on_input_thread -window";
                console.log("apex_start_launch:", start_launch_option)
                ApexLaunchOptionsConfig.forEach((option) => {
                    if (isSteamLaunchOptionsImpl(option)) {
                        if (option?.identifier === "forced_resolution") {
                            const h_ok = start_launch_option.includes("-height")
                            const w_ok = start_launch_option.includes("-width")
                            if (h_ok && w_ok) {
                                this.width = match_apex_width(start_launch_option) || 1920
                                this.height = match_apex_height(start_launch_option) || 1080
                                this.options_selection.push(option);
                            }
                        } else if (option?.identifier === "lobby_max_fps") {
                            if (start_launch_option.includes("+lobby_max_fps")) {
                                this.lobby_max_fps = match_apex_lobby_max_fps(start_launch_option) || 114
                                this.options_selection.push(option);
                            }
                        } else if (option?.identifier === "mat_letterbox_aspect_min") {
                            if (start_launch_option.includes("+mat_letterbox_aspect_min")) {
                                this.mat_letterbox_aspect_min = match_apex_mat_letterbox_aspect_min(start_launch_option) || 1.0
                                this.options_selection.push(option);
                            }
                        } else if (option?.identifier === "input_mouse") {
                            if (option?.parameters) {
                                for (const key in Object.keys(option.parameters)) {
                                    const value = option.parameters[key];
                                    if (typeof value?.parameter === 'string' && start_launch_option.includes(value?.parameter)) {
                                        this.options_selection.push(option);
                                        break;
                                    }
                                }
                            }
                        } else if (option?.identifier === "fps") {
                            const fps_max_ok = start_launch_option.includes("+fps_max");
                            const freq_ok = start_launch_option.includes("+freq");
                            if (fps_max_ok || freq_ok) {
                                this.fps = match_apex_fps_by_fps_max(start_launch_option) || match_apex_fps_by_freq(start_launch_option) || 114
                                this.options_selection.push(option);
                            }
                        } else if (option?.parameter) {
                            if (typeof option?.parameter === "string") {
                                if (start_launch_option.includes(option?.parameter)) {
                                    this.options_selection.push(option);
                                }
                            } else if (typeof option?.parameter === "object") {
                                for (const key in Object.keys(option.parameter)) {
                                    const value = option.parameter[key];
                                    if (start_launch_option.includes(value)) {
                                        this.options_selection.push(option);
                                    }
                                }
                            }
                        } else if (option?.parameters) {//只有 window和miles_language需要过这里
                            for (const key in Object.keys(option.parameters)) {
                                const value = option.parameters[key];
                                if (value?.parameter && typeof value?.parameter === "string" && start_launch_option.includes(value?.parameter)) {
                                    //匹配到了多个参数中的单个参
                                    this.options_selection.push(option);
                                    if (option?.identifier) {
                                        this.settings_config[option.identifier] = value?.default_parameter || value?.parameter || option?.default_parameter
                                    }
                                    break;
                                }
                            }
                        } else if (option?.identifier === "forced_resolution") {
                            // this.update_forced_resolution(start_launch_option)
                        }
                    }
                });
            }).catch((err) => {
                console.log(err);
                useToast().warning("Not find steam apex launch option!!");
            })
        },
        update_download_language_button_color() {
            if (!this.is_enabled_miles_language) {
                this.download_language_button_color = "grey-darken-1"
                this.is_miles_language_ready = true
            } else if (this.language === "english") {//英文语言不需要下载操作
                this.download_language_button_color = "green-lighten-4"
                this.is_miles_language_ready = true
            } else if (this.is_enabled_miles_language) {
                this.check_miles_language().then((is_ok) => {
                    this.is_miles_language_ready = is_ok
                    this.download_language_button_color = is_ok ? "success" : "error"
                })
            } else {
                this.download_language_button_color = "info"
            }
        }
    },
    getters: {
        //启动参数,最终输入的参数 组合勾选项
        launch_options(state) {
            const items: any[] = []
            state.options_selection.forEach((item: SteamLaunchOptionsImpl) => {
                if (item?.identifier === "lobby_max_fps") { //大厅fps
                    items.push(`+lobby_max_fps ${state.lobby_max_fps}`)
                } else if (item?.identifier === "forced_resolution") {//强制分辨率
                    items.push(`-width ${state.width} -height ${state.height}`)
                } else if (item?.identifier === "mat_letterbox_aspect_min") {//宽高比
                    items.push(`+mat_letterbox_aspect_min ${state.mat_letterbox_aspect_min}`)
                } else if (item?.parameter) {
                    if (typeof item.parameter === "string") {
                        items.push(item.parameter)
                    } else if (typeof item?.default_parameter === "string") {
                        items.push(item.default_parameter)
                    } else {
                        // parameter: ['-novid', '-dev']
                    }
                } else if (item?.parameters) {//多个参数
                    if (item.is_combination_parameters) {//组合参数 暂时只有input_mouse用
                        const value = item
                            .parameters
                            .map((item: SteamLaunchOptionsImpl) => item?.parameter)
                            .join(" ")
                        items.push(value);
                    } else if (item?.identifier) {
                        const value: string = state.settings_config[item?.identifier];
                        if (item.identifier === 'fps' && value.includes("X")) {
                            items.push(value.replace("X", state.fps.toString()))
                        } else {
                            items.push(value);
                        }
                    }
                }
            })
            return items.sort().join(" ")
        },
        //获取当前选择的语言标识符
        language(state) {
            const lsp = state.settings_config["miles_language"].split(" ")
            const language: string = lsp[lsp.length - 1]; // 拿后面的标识符
            return language
        },
        language_depot(): string | null {
            if (this.language in ApexMilesLanguagesDepot) {
                return ApexMilesLanguagesDepot[this.language]
            }
            return null
        },
        download_language_depot_command() {
            return `download_depot 1172470 ${this.language_depot}`
        },
        is_enabled_miles_language(state) {
            return state.options_selection.includes(ApexMilesLanguages)
        },
        is_launch_options_modified(state): boolean {
            return state.original_launch_options !== "" && this.launch_options !== state.original_launch_options
        }
    },
})
export default apexStore