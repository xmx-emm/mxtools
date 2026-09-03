import {ASPECT_LETTERBOX_MIN_DEFAULT, ASPECT_LETTERBOX_THRESHOLD} from '@/data/presets/apex_quick_preset.ts';
import type {ApexMilesDownloadProgress} from '@/ipc/commands.ts';
import {ApexFilterEnum, ApexPageTypeEnum} from '@/enum.ts';
import type {ApexConfigSnapshot} from '@/types/apex_config_snapshot.ts';
import type {
  ApexBinding,
  ApexGameSettingsFile,
  ApexGameSettingsReport,
  ApexGameSettingsSection,
} from '@/types/apex_game_settings.ts';
import type {PrimaryDisplayInfo} from '@/types/apex_quick_preset.ts';
import type {SteamLaunchOptionsImpl} from '@/types/steam.ts';
import type {Component} from 'vue';
import type {ApexConfigHistoryEntry, ApexConfigScope} from '@/types/apex_history.ts';

export function createApexState() {
  return {
    //语音包
    download_language_button_color: 'info',//下载语音包的按钮颜色
    download_miles_language_semi_automatic_dialog: false,
    /** Steam：手动下载语音包对话框 */
    download_miles_language_manual_dialog: false,
    /** EA：仅支持手动下载语音包 */
    download_miles_language_manual_dialog_ea: false,
    /** Steam：一键下载语音包对话框 */
    download_miles_language_auto_dialog: false,
    /** EA：一键下载语音包对话框 */
    download_miles_language_auto_dialog_ea: false,
    /** 一键下载进度（apex-miles-download-progress 事件负载） */
    miles_download_progress: <ApexMilesDownloadProgress | null>null,

    filter_type: ApexFilterEnum.normal,
    filter_search: '',//过滤搜索
    video_filter_type: ApexFilterEnum.normal,
    video_filter_search: '',
    video_individual_input: false,//单独输入模式：展开底层参数手动调
    game_settings_section: <ApexGameSettingsSection>'gameplay',
    game_settings_filter_search: '',
    is_videoconfig_readonly: false,//videoconfig.txt 是否只读
    is_videoconfig_readonly_busy: false,//只读切换中

    page_type: ApexPageTypeEnum.launch,

    is_start_loading: false,//从steam加载中
    is_video_config_loading: false,
    is_accounts_loading: false,
    accounts_loaded: false,
    accounts_load_status: <'idle' | 'loading' | 'ready' | 'error'>'idle',
    accounts_loaded_key: <string | null>null,
    accounts_request_generation: 0,
    accounts_load_error: <string | null>null,
    launch_load_status: <'idle' | 'loading' | 'ready' | 'error'>'idle',
    launch_loading_for_key: <string | null>null,
    launch_request_generation: 0,
    launch_load_error: <string | null>null,
    video_config_load_status: <'idle' | 'loading' | 'ready' | 'error'>'idle',
    video_config_loaded_key: <string | null>null,
    video_config_request_generation: 0,
    video_config_load_error: <string | null>null,
    game_settings_load_status: <'idle' | 'loading' | 'ready' | 'error'>'idle',
    game_settings_loaded_key: <string | null>null,
    game_settings_request_generation: 0,
    game_settings_load_error: <string | null>null,
    is_video_config_saving: false,
    is_game_settings_loading: false,
    is_game_settings_saving: false,
    is_game_settings_restoring: false,
    video_config_values: <Record<string, string>>{},
    original_video_config: <Record<string, string>>{},
    game_settings_report: <ApexGameSettingsReport | null>null,
    game_settings_values: <Record<ApexGameSettingsFile, Record<string, string>>>{
      settings: {},
      profile: {},
    },
    original_game_settings_values: <Record<ApexGameSettingsFile, Record<string, string>>>{
      settings: {},
      profile: {},
    },
    game_settings_bindings: <ApexBinding[]>[],
    original_game_settings_bindings: <Record<string, string>>{},
    game_settings_binding_draft_sequence: 0,
    game_settings_loaded: false,
    fps: 320,//锁帧
    lobby_max_fps: 0,//大厅帧数


    width: 1920,//强制的宽度
    height: 1080,//强制的高度

    //比例（min 默认放宽，避免窄于 goal 时强制黑边）
    mat_letterbox_aspect_min: ASPECT_LETTERBOX_MIN_DEFAULT,
    mat_letterbox_aspect_goal: 1.7778,
    mat_letterbox_aspect_threshold: ASPECT_LETTERBOX_THRESHOLD,

    options_selection: <SteamLaunchOptionsImpl[]>[],//勾选的项
    /** 不属于工具内置选项的启动命令，追加在生成的启动字符串末尾。 */
    custom_launch_options: '',
    settings_config: <Record<string, string>>({
      // 这里用来放 parameters 的配置,可多选的内容
      window: '-fullscreen',
      fps: '+fps_max unlimited',
      miles_language: '+miles_language japanese',
      miles_channels: '+miles_channels 2'
      // graphics_api 已从当前游戏构建移除(DX11 已删除,EAC 仅余 Settings.json)
    }),//多选项配置

    original_launch_options: '',//从Steam加载后的启动项快照
    is_miles_language_ready: true,//语音包是否就绪

    //提示视图,用来放显示的页面,直接在最上层显示
    tip_view: <Component | null | undefined>null,
    tip_props: <Record<string, unknown>>{},
    tip_dialog: false,

    /** 用于刷新列表后恢复选中项；合并账户见 getter apex_accounts / active_apex_account */
    launcher_selection_key: <string | null>null,

    quick_preset_display: <PrimaryDisplayInfo | null>null,
    quick_preset_applying: false,

    apex_q_dialog: false,

    config_export_dialog: false,
    config_import_dialog: false,
    config_import_snapshot: <ApexConfigSnapshot | null>null,
    is_config_snapshot_applying: false,

    config_history_dialog: false,
    reset_defaults_dialog: false,
    config_history: <ApexConfigHistoryEntry[]>[],
    is_config_history_loading: false,
    is_config_history_restoring: false,
    is_resetting_defaults: false,
    reset_pending_scopes: <ApexConfigScope[]>[],

    /** 当前账户下启动项是否已从磁盘加载(切换子页时避免重复 IPC) */
    launch_loaded_for_key: <string | null>null,
    /** 画面配置是否已加载 */
    video_config_loaded: false,
  };
}
