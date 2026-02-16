import {defineStore} from "pinia";
import {invoke} from "@tauri-apps/api/core";
import ApexLaunchOptionsConfig, {
    ApexMilesLanguages,
    ApexMilesLanguagesDepot
} from "@/data/apex_launch_options_config.ts";
import {SteamLaunchOptionsImpl} from "@/data/steam.ts";
import {useToast} from "vue-toastification";
import {steamStore} from "@/stores/game/steam.ts";
import {match_fps} from "@/utils/game/apex.ts";
import {Component, markRaw} from "vue";

export const apexStore = defineStore("apex", {
    state: () => ({
        download_language_button_color: "info",//下载语音包的按钮颜色
        download_miles_language_dialog: false,
        manual_download_miles_language_dialog: false, //手动下载
        is_start_loading: false,//从steam加载中
        fps: 144,//锁帧
        options_selection: <SteamLaunchOptionsImpl[]>[],//勾选的项
        settings_config: <{ [key: string]: string | any }>({
            window: "-fullscreen",
            fps: "+fps_max unlimited",
            miles_language: "+miles_language japanese",
        }),//多选项配置

        //提示视图
        tip_view: <Component | null | undefined>null,
        tip_dialog: false
    }),
    actions: {
        //从steam加载启动数据
        start_launch() {
            this.is_start_loading = true
            this.options_selection = []
            this.download_miles_language_dialog = false
            setTimeout(async () => {
                await this.start_load_apex_launch_options_data()
                this.is_start_loading = false;
            }, 300)
        },
        //通过读取对应steam user用户的loadconfig.vdf获取启动参数并解析
        async start_load_apex_launch_options_data() {
            const steam_state = steamStore()
            const user_id = steam_state.active_steam_user?.id
            await invoke<string>("get_apex_launch_option", {
                id: Number(user_id),
            }).then((start_launch_option) => {
                // start_launch_option = "+cl fovScale \"1.7\" +cl_is_softened_locale 1 +cl_showfps 1 +cl_showpos 1 +fps_max unlimited +miles_language english -dev -high -no_render_on_input_thread -window";
                console.log("apex_start_launch:", start_launch_option)
                ApexLaunchOptionsConfig.forEach((option: SteamLaunchOptionsImpl) => {
                    if (option?.parameter) {
                        if (typeof option?.parameter === "string") {
                            if (start_launch_option.includes(option?.parameter)) {
                                this.options_selection.push(option);
                            }
                        } else if (typeof option?.parameter === "object") {
                            for (const p in option.parameter) {
                                if (start_launch_option.includes(p)) {
                                    this.options_selection.push(option);
                                }
                            }
                        }
                    } else if (option?.parameters) {
                        for (const key in Object.keys(option.parameters)) {
                            const value = option.parameters[key];
                            if (value?.parameter && typeof value?.parameter === "string" && start_launch_option.includes(value?.parameter)) {
                                //匹配到了多个参数中的单个参
                                this.options_selection.push(option);
                                if (option?.identifier) {
                                    this.settings_config[option.identifier] = value?.default_parameter || value?.parameter || option?.default_parameter
                                }
                                break;
                            } else if (option?.identifier && value?.parameter && typeof value?.parameter === "object") {
                                for (let pk in value.parameter) {
                                    let p = value.parameter[pk];
                                    if (value?.replace_numbers) {
                                        p = p.replace(" X", "")
                                    }
                                    if (start_launch_option.includes(p)) {
                                        this.settings_config[option.identifier] = value?.default_parameter || value?.parameter || option?.default_parameter
                                        this.options_selection.push(option);
                                        if (value?.identifier === "restriction_fps") {
                                            this.fps = match_fps(start_launch_option) || 514
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    }
                });
            }).catch((err) => {
                console.log(err);
                useToast().error("Not find steam apex launch option!!");
            })
        },
        //在应用时检查配音文件是否存在,反回是否错误的布尔值
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
        update_download_language_button_color() {
            // console.log("update_download_language_button_color", this.is_enabled_miles_language)
            if (!this.is_enabled_miles_language) {
                this.download_language_button_color = "grey-darken-1"
            } else if (this.language === "english") {//英文语言不需要下载操作
                this.download_language_button_color = "green-lighten-4"
            } else if (this.is_enabled_miles_language) {
                this.check_miles_language().then((is_ok) => {
                    this.download_language_button_color = is_ok ? "success" : "error"
                })
            } else {
                this.download_language_button_color = "info"
            }
        },
        showTip(item: SteamLaunchOptionsImpl) {
            if (item.tip !== null && item.tip !== undefined) {
                this.tip_view = markRaw(item.tip);
                this.tip_dialog = true
            }
        },
        closeTip() {
            this.tip_dialog = false
        }
    },
    getters: {
        launch_options(state) {//启动参数,最终输入的参数 组合勾选项
            const items: any[] = []
            state.options_selection.forEach((item: any) => {
                if (item?.parameter) {
                    if (typeof item.parameter === "string") {
                        items.push(item.parameter)
                    } else if (typeof item?.default_parameter === "string") {
                        items.push(item.default_parameter)
                    } else {
                        // parameter: ['-novid', '-dev']
                    }
                } else if (item?.parameters) {//多个参数
                    const value: string = state.settings_config[item.identifier];
                    if (item.identifier === 'fps' && value.includes("X")) {
                        items.push(value.replace("X", state.fps.toString()))
                    } else {
                        items.push(value);
                    }
                }
            })
            return items.sort().join(" ")
        },
        language(state) {//获取当前选择的语言标识符
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
        }
    },
    persist: false,//每次启动及修改用户时都初始化
})