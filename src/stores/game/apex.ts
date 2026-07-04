import {defineStore} from 'pinia';
import {invoke} from '@tauri-apps/api/core';
import ApexLaunchOptionsConfig, {
  ApexMilesLanguages,
  ApexMilesLanguagesDepot
} from '@/data/apex_launch_options_config.ts';
import {isSteamLaunchOptionsImpl, SteamLaunchOptionsImpl} from '@/types/steam.ts';
import {useToast} from 'vue-toastification';
import eaStore from '@/stores/game/ea.ts';
import steamStore from '@/stores/game/steam.ts';
import type {ApexLauncherAccount} from '@/types/apex.ts';
import {
  match_apex_fps_by_fps_max,
  match_apex_fps_by_freq,
  is_apex_fps_unlimited,
  match_apex_height,
  match_apex_lobby_max_fps,
  match_apex_mat_letterbox_aspect_goal,
  match_apex_mat_letterbox_aspect_min,
  match_apex_mat_letterbox_aspect_threshold,
  match_apex_width
} from '@/utils/game/apex.ts';
import {Component, markRaw} from 'vue';
import {ApexFilterEnum, ApexPageTypeEnum} from '@/enum.ts';
import ApexVideoConfig from '@/data/apex_video_config.ts';
import {
  collectVideoConfigIdentifiers,
  isApexVideoConfigImpl,
  type ApexVideoConfigImpl,
} from '@/types/apex.ts';
import {
  ASPECT_LETTERBOX_THRESHOLD,
  findGraphicsQualityPreset,
  quickPresetVideoConfigToggles,
} from '@/data/presets/apex_quick_preset.ts';
import type {ApexQuickPresetSelection, PrimaryDisplayInfo} from '@/types/apex_quick_preset.ts';
import {
  applyQuickPresetLaunchOptions,
  applyQuickPresetVideoOptions,
  buildVideoResolutionValues,
  quickPresetVideoToggleKeys,
  resolveGameResolution,
} from '@/utils/game/apex_quick_preset.ts';
import {
  applyDvsRelatedConstraints,
  dvsTargetToConfig,
  type DvsConstraintTrigger,
} from '@/utils/apex_dvs.ts';

/** 数值容差比较：避免 '0.6' 与 '0.600000' 字符串不等 */
function video_config_value_equals(a: string, b: string): boolean {
  if (a === b) return true;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    return Math.abs(na - nb) < 1e-6;
  }
  return false;
}

export type ApexVideoWindowMode = 'fullscreen' | 'windowed' | 'borderless';

function launcherAccountKey(acc: ApexLauncherAccount): string {
  return `${acc.kind}:${acc.user.id}`;
}

const MILES_LANGUAGE_CHECK_CACHE_MS = import.meta.env.DEV ? 120000 : 60000;
let miles_language_check_cache: { key: string; at: number; value: boolean } | null = null;
let miles_language_check_in_flight: Promise<boolean> | null = null;

function milesLanguageCheckKey(
  acc: ApexLauncherAccount | null,
  language: string,
  milesEnabled: boolean,
): string | null {
  if (!acc || !milesEnabled) return null;
  return `${acc.kind}:${acc.user.id}:${language}`;
}

function invalidateMilesLanguageCheckCache() {
  miles_language_check_cache = null;
}

function findApexAccountByKey(accounts: ApexLauncherAccount[], key: string | null): ApexLauncherAccount | null {
  if (!key) return null;
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const kind = key.slice(0, idx) as 'steam' | 'ea';
  const id = key.slice(idx + 1);
  if (kind !== 'steam' && kind !== 'ea') return null;
  return accounts.find((a) => a.kind === kind && a.user.id === id) ?? null;
}

/** 恢复 Apex 选中账户：优先持久化的 launcher_selection_key，其次 EA/Steam 各自 store 中的 active user */
function resolveActiveApexAccount(
  accounts: ApexLauncherAccount[],
  launcherKey: string | null,
): ApexLauncherAccount | null {
  const fromKey = findApexAccountByKey(accounts, launcherKey);
  if (fromKey) return fromKey;
  if (accounts.length === 0) return null;

  const steam = steamStore();
  const ea = eaStore();
  const fromEa = findApexAccountByKey(accounts, ea.active_ea_user ? `ea:${ea.active_ea_user.id}` : null);
  if (fromEa) return fromEa;
  const fromSteam = findApexAccountByKey(
    accounts,
    steam.active_steam_user ? `steam:${steam.active_steam_user.id}` : null,
  );
  if (fromSteam) return fromSteam;
  return accounts.find((a) => a.kind === 'steam') ?? accounts[0];
}

function video_config_display_key(identifier: string): string {
  return identifier.replace(/^setting\./, '');
}

function normalize_video_config_map(raw: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    normalized[key.replace(/^"+|"+$/g, '')] = value;
  }
  return normalized;
}

function find_launch_option_by_identifier(identifier: string): SteamLaunchOptionsImpl | undefined {
  for (const row of ApexLaunchOptionsConfig) {
    if (isSteamLaunchOptionsImpl(row) && row.identifier === identifier) {
      return row;
    }
  }
  return undefined;
}

function ensure_option_in_selection(
  selection: SteamLaunchOptionsImpl[],
  identifier: string,
): void {
  const option = find_launch_option_by_identifier(identifier);
  if (!option) return;
  if (!selection.some((item) => item.identifier === identifier)) {
    selection.push(option);
  }
}

function remove_option_from_selection(
  selection: SteamLaunchOptionsImpl[],
  identifier: string,
): void {
  const idx = selection.findIndex((item) => item.identifier === identifier);
  if (idx >= 0) {
    selection.splice(idx, 1);
  }
}

let syncing_dvs_constraints = false;

const apexStore = defineStore('apex', {
  state: () => ({
    //语音包
    download_language_button_color: 'info',//下载语音包的按钮颜色
    download_miles_language_semi_automatic_dialog: false,
    /** Steam：手动下载语音包对话框 */
    download_miles_language_manual_dialog: false,
    /** EA：仅支持手动下载语音包 */
    download_miles_language_manual_dialog_ea: false,

    filter_type: ApexFilterEnum.normal,
    filter_search: '',//过滤搜索
    video_filter_type: ApexFilterEnum.normal,
    video_filter_search: '',
    video_individual_input: false,//单独输入模式：展开底层参数手动调
    is_videoconfig_readonly: false,//videoconfig.txt 是否只读
    is_videoconfig_readonly_busy: false,//只读切换中

    page_type: ApexPageTypeEnum.launch,

    is_start_loading: false,//从steam加载中
    is_video_config_loading: false,
    is_accounts_loading: false,
    is_video_config_saving: false,
    video_config_values: <Record<string, string>>{},
    original_video_config: <Record<string, string>>{},
    fps: 320,//锁帧
    lobby_max_fps: 0,//大厅帧数


    width: 1920,//强制的宽度
    height: 1080,//强制的高度

    //比例
    mat_letterbox_aspect_min: 1.7778,
    mat_letterbox_aspect_goal: 1.7778,
    mat_letterbox_aspect_threshold: ASPECT_LETTERBOX_THRESHOLD,

    options_selection: <SteamLaunchOptionsImpl[]>[],//勾选的项
    settings_config: <{ [key: string]: string | any }>({
      // 这里用来放 parameters 的配置,可多选的内容
      window: '-fullscreen',
      fps: '+fps_max unlimited',
      miles_language: '+miles_language japanese',
      miles_channels: '+miles_channels 2',
      graphics_api: '-anticheat_settings=SettingsDX11.json'
    }),//多选项配置

    original_launch_options: '',//从Steam加载后的启动项快照
    is_miles_language_ready: true,//语音包是否就绪

    //提示视图,用来放显示的页面,直接在最上层显示
    tip_view: <Component | null | undefined>null,
    tip_dialog: false,

    /** 用于刷新列表后恢复选中项；合并账户见 getter apex_accounts / active_apex_account */
    launcher_selection_key: <string | null>null,

    quick_preset_dialog: false,
    quick_preset_display: <PrimaryDisplayInfo | null>null,
    quick_preset_applying: false,

    /** 当前账户下启动项是否已从磁盘加载(切换子页时避免重复 IPC) */
    launch_loaded_for_key: <string | null>null,
    /** 画面配置是否已加载 */
    video_config_loaded: false,
  }),
  actions: {
    //从steam加载启动数据
    async check_miles_language(force = false) {
      const acc = this.active_apex_account;
      const milesEnabled = this.is_enabled_miles_language;
      if (!milesEnabled) {
        invalidateMilesLanguageCheckCache();
        return true;
      }
      if (this.language === 'english') {
        invalidateMilesLanguageCheckCache();
        return true;
      }
      const cacheKey = milesLanguageCheckKey(acc, this.language, milesEnabled);
      const now = Date.now();
      if (
        !force
        && cacheKey
        && miles_language_check_cache
        && miles_language_check_cache.key === cacheKey
        && now - miles_language_check_cache.at < MILES_LANGUAGE_CHECK_CACHE_MS
      ) {
        return miles_language_check_cache.value;
      }
      if (miles_language_check_in_flight) {
        return miles_language_check_in_flight;
      }
      const platform = acc?.kind === 'ea' ? 'ea' : 'steam';
      const eaUserId = acc?.kind === 'ea' ? acc.user.id : null;
      const t0 = performance.now();
      miles_language_check_in_flight = invoke<boolean>('check_apex_miles_language', {
        language: this.language,
        platform,
        eaUserId,
      })
        .then((is_ok) => {
          const ms = Math.round(performance.now() - t0);
          if (cacheKey) {
            miles_language_check_cache = { key: cacheKey, at: Date.now(), value: is_ok };
          }
          // #region agent log
          fetch('http://127.0.0.1:7444/ingest/66dbfdc8-b457-46f4-a047-8abb5a080193', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2dd425' },
            body: JSON.stringify({
              sessionId: '2dd425',
              location: 'apex.ts:check_miles_language',
              message: 'miles_language_ipc',
              data: { ms, ok: is_ok, cacheKey },
              timestamp: Date.now(),
              hypothesisId: 'H6',
            }),
          }).catch(() => {});
          // #endregion
          console.log('check_apex_miles_language', is_ok, `${ms}ms`);
          return is_ok;
        })
        .catch((e) => {
          console.warn('check_apex_miles_language err', this.language, e);
          return false;
        })
        .finally(() => {
          miles_language_check_in_flight = null;
        });
      return miles_language_check_in_flight;
    },
    //通过读取对应steam user用户的loadconfig.vdf获取启动参数并解析
    closeTip() {
      this.tip_dialog = false;
    },
    //在应用时检查配音文件是否存在,反回是否错误的布尔值
    showTip(item: { tip?: Component | null | undefined }) {
      if (item.tip !== null && item.tip !== undefined) {
        this.tip_view = markRaw(item.tip);
        this.tip_dialog = true;
      }
    },
    start_launch(force = false) {
      const key = this.launcher_selection_key;
      if (
        !force
        && key
        && this.launch_loaded_for_key === key
        && this.original_launch_options !== ''
      ) {
        return;
      }
      void this.load_launch_data();
    },

    async load_launch_data() {
      if (this.is_start_loading) return;
      this.is_start_loading = true;
      this.download_miles_language_semi_automatic_dialog = false;
      this.download_miles_language_manual_dialog = false;
      this.download_miles_language_manual_dialog_ea = false;
      try {
        await this.start_load_apex_launch_options_data();
        this.original_launch_options = this.launch_options;
        this.launch_loaded_for_key = this.launcher_selection_key;
        this.update_download_language_button_color();
      } finally {
        this.is_start_loading = false;
      }
    },

    /** 刷新账户列表并重新加载启动项(单一加载态,避免 overlay 与列表项 spinner 叠层) */
    async reload_launch_page() {
      if (this.is_start_loading) return;
      this.is_start_loading = true;
      this.download_miles_language_semi_automatic_dialog = false;
      this.download_miles_language_manual_dialog = false;
      this.download_miles_language_manual_dialog_ea = false;
      try {
        await this.refresh_apex_accounts({ silent: true });
        await this.start_load_apex_launch_options_data();
        this.original_launch_options = this.launch_options;
        this.launch_loaded_for_key = this.launcher_selection_key;
        this.update_download_language_button_color();
      } finally {
        this.is_start_loading = false;
      }
    },

    set_active_apex_account(acc: ApexLauncherAccount) {
      const nextKey = launcherAccountKey(acc);
      if (this.launcher_selection_key !== nextKey) {
        this.launch_loaded_for_key = null;
        this.video_config_loaded = false;
        this.original_launch_options = '';
        this.original_video_config = {};
        this.video_config_values = {};
        invalidateMilesLanguageCheckCache();
      }
      this.launcher_selection_key = nextKey;
      if (acc.kind === 'steam') {
        steamStore().set_active_steam_user(acc.user);
      } else {
        eaStore().set_active_ea_user(acc.user);
      }
    },

    async refresh_apex_accounts(options?: { silent?: boolean }) {
      if (this.is_accounts_loading) return;
      const silent = options?.silent ?? false;
      if (!silent) {
        this.is_accounts_loading = true;
      }
      try {
        const steam = steamStore();
        const ea = eaStore();
        await steam.refresh_users();
        await ea.refresh_users();

        const accounts: ApexLauncherAccount[] = [
          ...steam.steam_users.map((user) => ({ kind: 'steam' as const, user })),
          ...ea.ea_desktop_users.map((user) => ({ kind: 'ea' as const, user })),
        ];

        const next = resolveActiveApexAccount(accounts, this.launcher_selection_key);
        if (next) {
          this.set_active_apex_account(next);
        } else {
          this.launcher_selection_key = null;
        }
      } finally {
        if (!silent) {
          this.is_accounts_loading = false;
        }
      }
    },

    /** 将已加载的启动参数字符串解析为勾选项(Steam VDF 与 EA INI 共用)
     * 其中 fov_scale在ea与steam中不同
     * */
    parse_loaded_launch_string(start_launch_option: string) {
      const selection: SteamLaunchOptionsImpl[] = [];
      const settingsPatch: Record<string, string> = {};
      let width: number | undefined;
      let height: number | undefined;
      let lobby_max_fps: number | undefined;
      let mat_letterbox_aspect_min: number | undefined;
      let mat_letterbox_aspect_goal: number | undefined;
      let mat_letterbox_aspect_threshold: number | undefined;
      let fps: number | undefined;

      ApexLaunchOptionsConfig.forEach((option) => {
        if (isSteamLaunchOptionsImpl(option)) {
          if (option?.identifier === 'forced_resolution') {
            const h_ok = start_launch_option.includes('-height');
            const w_ok = start_launch_option.includes('-width');
            if (h_ok && w_ok) {
              width = match_apex_width(start_launch_option) || 1920;
              height = match_apex_height(start_launch_option) || 1080;
              selection.push(option);
            }
          } else if (option?.identifier === 'reticle_color') {
            if (start_launch_option.includes('+reticle_color')) {
              selection.push(option);
            }
          } else if (option?.identifier === 'fov_scale') {
            if (start_launch_option.includes('fovScale')) {
              selection.push(option);
            }
          } else if (option?.identifier === 'skip_intro_animation') { //可以不用在这里处理?
            const is_dev = start_launch_option.includes('-dev');
            const is_novid = start_launch_option.includes('-novid');
            if (is_dev || is_novid) {
              selection.push(option);
            }
          } else if (option?.identifier === 'lobby_max_fps') {
            if (start_launch_option.includes('+lobby_max_fps')) {
              lobby_max_fps = match_apex_lobby_max_fps(start_launch_option) || 114;
              selection.push(option);
            }
          } else if (option?.identifier === 'letterbox_aspect') {
            if (start_launch_option.includes('letterbox_aspect')) {
              mat_letterbox_aspect_min = match_apex_mat_letterbox_aspect_min(start_launch_option) || 1.0;
              mat_letterbox_aspect_goal = match_apex_mat_letterbox_aspect_goal(start_launch_option) || 1.0;
              mat_letterbox_aspect_threshold = match_apex_mat_letterbox_aspect_threshold(start_launch_option) || ASPECT_LETTERBOX_THRESHOLD;
              selection.push(option);
            }
          } else if (option?.identifier === 'input_mouse') {
            if (option?.parameters) {
              for (const key in Object.keys(option.parameters)) {
                const value = option.parameters[key];
                if (typeof value?.parameter === 'string' && start_launch_option.includes(value?.parameter)) {
                  selection.push(option);
                  break;
                }
              }
            }
          } else if (option?.identifier === 'fps') {
            const has_fps_max = /(?:^|\s)\+fps_max\s/.test(start_launch_option);
            const has_freq = /(?:^|\s)-freq\s/.test(start_launch_option);
            if (has_fps_max || has_freq) {
              selection.push(option);
              if (is_apex_fps_unlimited(start_launch_option)) {
                settingsPatch['fps'] = '+fps_max unlimited';
              } else {
                const parsed =
                  match_apex_fps_by_fps_max(start_launch_option)
                  ?? match_apex_fps_by_freq(start_launch_option);
                if (parsed !== null) {
                  fps = parsed;
                }
                settingsPatch['fps'] = '-freq X +fps_max X';
              }
            }
          } else if (option?.parameter) {
            if (typeof option?.parameter === 'string') {
              if (start_launch_option.includes(option?.parameter)) {
                selection.push(option);
              }
            } else if (typeof option?.parameter === 'object') {
              for (const key in Object.keys(option.parameter)) {
                const value = option.parameter[key];
                if (start_launch_option.includes(value)) {
                  selection.push(option);
                }
              }
            }
          } else if (option?.parameters) {//只有 window和miles_language需要过这里
            for (const key in Object.keys(option.parameters)) {
              const value = option.parameters[key];
              if (value?.parameter && typeof value?.parameter === 'string' && start_launch_option.includes(value?.parameter)) {
                selection.push(option);
                if (option?.identifier) {
                  settingsPatch[option.identifier] = value?.default_parameter || value?.parameter || option?.default_parameter;
                }
                break;
              }
            }
          }
        }
      });

      this.options_selection = selection;
      if (width !== undefined) this.width = width;
      if (height !== undefined) this.height = height;
      if (lobby_max_fps !== undefined) this.lobby_max_fps = lobby_max_fps;
      if (mat_letterbox_aspect_min !== undefined) this.mat_letterbox_aspect_min = mat_letterbox_aspect_min;
      if (mat_letterbox_aspect_goal !== undefined) this.mat_letterbox_aspect_goal = mat_letterbox_aspect_goal;
      if (mat_letterbox_aspect_threshold !== undefined) this.mat_letterbox_aspect_threshold = mat_letterbox_aspect_threshold;
      if (fps !== undefined) this.fps = fps;
      for (const [key, value] of Object.entries(settingsPatch)) {
        this.settings_config[key] = value;
      }
    },

    start_load_apex_launch_options_data: async function () {
      const acc = this.active_apex_account;
      const toast = useToast();
      if (!acc) {
        toast.warning('apex.noLauncherAccount');
        this.options_selection = [];
        return;
      }
      const run = async () => {
        let start_launch_option: string;
        if (acc.kind === 'steam') {
          const id = Number(acc.user.id);
          if (!Number.isFinite(id)) {
            toast.warning('apex.noLauncherAccount');
            return;
          }
          start_launch_option = await invoke<string>('get_apex_launch_option', { id });
        } else {
          start_launch_option = await invoke<string>('get_apex_launch_option_ea', {
            eaUserId: acc.user.id,
          });
        }
        this.parse_loaded_launch_string(start_launch_option);
        console.log('[apex] launch options loaded', {
          account: { kind: acc.kind, id: acc.user.id, name: acc.user.name },
          raw: start_launch_option,
        });
      };
      try {
        await run();
      } catch (err) {
        console.warn('apex launch option load failed', err);
      }
    },

    set_page_type(page: ApexPageTypeEnum) {
      this.page_type = page;
    },

    async load_apex_video_config() {
      this.is_video_config_loading = true;
      try {
        let raw_map: Record<string, string> = {};
        try {
          raw_map = await invoke<Record<string, string>>('get_apex_video_config');
        } catch {
          // 兼容旧版后端：仅提供通用配置读取命令。
          raw_map = await invoke<Record<string, string>>('get_apex_config_file', { kind: 'videoconfig' });
        }
        const map = normalize_video_config_map(raw_map);
        this.video_config_values = {...map};
        this.original_video_config = {...map};
        this.video_config_loaded = true;
        await this.load_videoconfig_readonly();
      } catch (err) {
        console.warn('load_apex_video_config failed', err);
        const toast = useToast();
        toast.warning('apex.videoConfigLoadFailed');
      } finally {
        this.is_video_config_loading = false;
      }
    },

    start_video_config(force = false) {
      if (!force && this.video_config_loaded && Object.keys(this.video_config_values).length > 0) {
        return;
      }
      void this.load_apex_video_config();
    },

    set_video_config_value(identifier: string, value: string) {
      this.video_config_values[identifier] = value;
      if (syncing_dvs_constraints) return;
      if (
        identifier === 'setting.dvs_enable'
        || identifier === 'setting.dvs_gpuframetime_min'
        || identifier === 'setting.dvs_gpuframetime_max'
      ) {
        this.sync_dvs_related_settings('dvs');
      }
    },

    sync_dvs_related_settings(trigger: DvsConstraintTrigger) {
      if (syncing_dvs_constraints) return;
      syncing_dvs_constraints = true;
      try {
        applyDvsRelatedConstraints(
          (id) => this.get_video_config_value(id),
          (id, val) => {
            this.video_config_values[id] = val;
          },
          trigger,
        );
      } finally {
        syncing_dvs_constraints = false;
      }
    },

    set_dvs_fps_target(target: number) {
      const { enable, min, max } = dvsTargetToConfig(target);
      syncing_dvs_constraints = true;
      try {
        this.video_config_values['setting.dvs_enable'] = enable;
        this.video_config_values['setting.dvs_gpuframetime_min'] = min;
        this.video_config_values['setting.dvs_gpuframetime_max'] = max;
      } finally {
        syncing_dvs_constraints = false;
      }
      this.sync_dvs_related_settings('dvs');
    },

    get_video_config_value(identifier: string): string {
      const value = this.video_config_values[identifier]
        ?? this.video_config_values[`"${identifier}"`]
        ?? '';
      return value;
    },

    get_video_config_bool(identifier: string, onValue = '1'): boolean {
      return video_config_value_equals(this.get_video_config_value(identifier), onValue);
    },

    set_video_config_bool(identifier: string, enabled: boolean, onValue = '1', offValue = '0') {
      this.set_video_config_value(identifier, enabled ? onValue : offValue);
      if (identifier === 'setting.mat_antialias_mode') {
        this.sync_dvs_related_settings('antialias');
      }
    },

    /** enum：返回当前匹配的档位 index，无匹配返回 -1(界面显示为未选中) */
    get_video_config_enum(item: ApexVideoConfigImpl): number {
      const options = item.options ?? [];
      for (let i = 0; i < options.length; i++) {
        const matched = Object.entries(options[i].values).every(([key, value]) =>
          video_config_value_equals(this.get_video_config_value(key), value),
        );
        if (matched) return i;
      }
      return -1;
    },

    /** enum：选中某档位，写入该档位的全部底层键值 */
    set_video_config_enum(item: ApexVideoConfigImpl, optionIndex: number) {
      const option = item.options?.[optionIndex];
      if (!option) return;
      for (const [key, value] of Object.entries(option.values)) {
        this.set_video_config_value(key, value);
      }
      if (item.identifier === 'setting.mat_vsync_mode') {
        this.sync_dvs_related_settings('vsync');
      }
    },

    get_video_config_number(identifier: string, fallback = 0): number {
      const raw = this.get_video_config_value(identifier);
      const n = Number(raw);
      return Number.isFinite(n) ? n : fallback;
    },

    set_video_config_number(identifier: string, value: number, valueType: 'integer' | 'float') {
      const text = valueType === 'integer' ? String(Math.round(value)) : String(value);
      this.set_video_config_value(identifier, text);
    },

    get_video_config_parameter_info(item: ApexVideoConfigImpl): string {
      return collectVideoConfigIdentifiers(item)
        .map((id) => `${video_config_display_key(id)} ${this.get_video_config_value(id)}`)
        .join(' ');
    },

    get_video_config_window_mode(): ApexVideoWindowMode {
      const fullscreen = this.get_video_config_bool('setting.fullscreen');
      const borderless = this.get_video_config_bool('setting.nowindowborder');
      if (fullscreen && borderless) return 'fullscreen';
      if (borderless) return 'borderless';
      return 'windowed';
    },

    set_video_config_window_mode(mode: ApexVideoWindowMode) {
      if (mode === 'fullscreen') {
        this.set_video_config_bool('setting.fullscreen', true);
        this.set_video_config_bool('setting.nowindowborder', true);
      } else if (mode === 'borderless') {
        this.set_video_config_bool('setting.fullscreen', false);
        this.set_video_config_bool('setting.nowindowborder', true);
      } else {
        this.set_video_config_bool('setting.fullscreen', false);
        this.set_video_config_bool('setting.nowindowborder', false);
      }
    },

    build_video_config_updates(): Record<string, string> {
      const updates: Record<string, string> = {};
      for (const row of ApexVideoConfig) {
        if (!isApexVideoConfigImpl(row)) continue;
        for (const id of collectVideoConfigIdentifiers(row)) {
          if (id in this.video_config_values) {
            updates[id] = this.video_config_values[id];
          }
        }
      }
      return updates;
    },

    async apply_apex_video_config(options?: { silent?: boolean }): Promise<boolean> {
      const toast = useToast();
      const running = await invoke<boolean>('apex_is_running').catch(() => false);
      if (running) {
        toast.error('apex.apexRunningVideoConfig');
        return false;
      }
      this.is_video_config_saving = true;
      try {
        const updates = this.build_video_config_updates();
        await invoke('set_apex_video_config', {updates});
        this.original_video_config = {...this.video_config_values};
        // 选用了 Apex 预设之外的档位时，强制只读，防止启动游戏被还原。
        if (this.has_out_of_preset_selection) {
          try {
            await this.set_videoconfig_readonly(true);
            toast.info('apex.outOfPresetAutoLocked');
          } catch (e) {
            console.warn('force readonly after apply failed', e);
          }
        } else {
          await this.load_videoconfig_readonly();
        }
        if (!options?.silent) {
          toast.success('toast.applyVideoConfigSuccess');
        }
        return true;
      } catch (err) {
        console.warn('apply_apex_video_config failed', err);
        if (!options?.silent) {
          toast.error('toast.applyVideoConfigError');
        }
        return false;
      } finally {
        this.is_video_config_saving = false;
      }
    },

    /** 读取 videoconfig.txt 当前只读状态 */
    async load_videoconfig_readonly() {
      try {
        this.is_videoconfig_readonly = await invoke<boolean>('get_apex_videoconfig_readonly');
      } catch (e) {
        console.warn('load_videoconfig_readonly failed', e);
      }
    },

    /** 设置/取消 videoconfig.txt 只读 */
    async set_videoconfig_readonly(locked: boolean): Promise<boolean> {
      const toast = useToast();
      this.is_videoconfig_readonly_busy = true;
      try {
        await invoke('set_apex_videoconfig_readonly', {locked});
        this.is_videoconfig_readonly = locked;
        return true;
      } catch (e) {
        console.warn('set_videoconfig_readonly failed', e);
        toast.error(String(e));
        return false;
      } finally {
        this.is_videoconfig_readonly_busy = false;
      }
    },

    open_quick_preset_dialog() {
      this.quick_preset_dialog = true;
    },

    close_quick_preset_dialog() {
      this.quick_preset_dialog = false;
    },

    set_quick_preset_display(info: PrimaryDisplayInfo | null) {
      this.quick_preset_display = info;
    },

    /** 将快速预设选项写入内存状态(启动项 + 视频配置)，不落盘 */
    prepare_quick_preset(screen: PrimaryDisplayInfo, selection: ApexQuickPresetSelection) {
      const gfx = findGraphicsQualityPreset(selection.graphicsPresetId);
      if (!gfx) {
        throw new Error('GRAPHICS_PRESET_NOT_FOUND');
      }

      this.fps = selection.fpsCap;
      this.lobby_max_fps = selection.fpsCap;

      if (selection.enableResolutionPreset) {
        const { width, height } = resolveGameResolution(
          screen,
          selection.aspectValue,
          selection.lockAxis,
        );
        this.width = width;
        this.height = height;
        this.mat_letterbox_aspect_min = selection.aspectValue;
        this.mat_letterbox_aspect_goal = selection.aspectValue;
        this.mat_letterbox_aspect_threshold = ASPECT_LETTERBOX_THRESHOLD;
        ensure_option_in_selection(this.options_selection, 'forced_resolution');
        ensure_option_in_selection(this.options_selection, 'letterbox_aspect');
        for (const [key, value] of Object.entries(buildVideoResolutionValues(width, height))) {
          this.set_video_config_value(key, value);
        }
      } else {
        remove_option_from_selection(this.options_selection, 'forced_resolution');
        remove_option_from_selection(this.options_selection, 'letterbox_aspect');
      }

      ensure_option_in_selection(this.options_selection, 'fps');
      ensure_option_in_selection(this.options_selection, 'lobby_max_fps');
      applyQuickPresetLaunchOptions(this.options_selection, selection.launchOptions);

      if (selection.enableSimplifiedReticle) {
        ensure_option_in_selection(this.options_selection, 'reticle_color');
      } else {
        remove_option_from_selection(this.options_selection, 'reticle_color');
      }
      this.settings_config['fps'] = '-freq X +fps_max X';

      const toggle_keys = quickPresetVideoToggleKeys();
      const prior_toggle_values: Record<string, string> = {};
      for (const key of toggle_keys) {
        const value = this.get_video_config_value(key);
        if (value !== '') {
          prior_toggle_values[key] = value;
        }
      }

      for (const [key, value] of Object.entries(gfx.values)) {
        this.set_video_config_value(key, value);
      }
      applyQuickPresetVideoOptions(
        (key, value) => this.set_video_config_value(key, value),
        selection.videoOptions,
      );
      for (const opt of quickPresetVideoConfigToggles) {
        const enabled = selection.videoOptions[opt.key] ?? opt.defaultEnabled;
        if (enabled) continue;
        for (const key of Object.keys(opt.onValues)) {
          if (key in prior_toggle_values) {
            this.set_video_config_value(key, prior_toggle_values[key]);
          }
        }
      }
    },

    /** 将当前 launch_options 写入 Steam / EA(不含启动器关闭检测) */
    async persist_launch_options(): Promise<void> {
      const acc = this.active_apex_account;
      if (!acc) {
        throw new Error('NO_LAUNCHER_ACCOUNT');
      }
      if (acc.kind === 'steam') {
        await invoke<void>('set_apex_launch_option', {
          id: Number(acc.user.id),
          launchOption: this.launch_options,
        });
      } else {
        await invoke<void>('set_apex_launch_option_ea', {
          eaUserId: acc.user.id,
          launchOption: this.launch_options,
        });
      }
      this.original_launch_options = this.launch_options;
    },

    /**
     * 快速预设联合应用：先确保配置已加载，再写启动项与 videoconfig。
     * 调用方需自行处理 Steam/EA 运行中的提示。
     */
    /** 落盘前确保启动项与视频配置已从磁盘加载(避免 load 覆盖 prepare 写入的值) */
    async ensure_configs_loaded_for_preset(): Promise<void> {
      if (this.original_launch_options === '') {
        await this.start_load_apex_launch_options_data();
      }
      if (Object.keys(this.video_config_values).length === 0) {
        await this.load_apex_video_config();
      }
    },

    /** 快速预设落盘(调用前须 ensure_configs_loaded + prepare_quick_preset) */
    async apply_quick_preset_persist(): Promise<boolean> {
      const toast = useToast();
      this.quick_preset_applying = true;
      try {
        if (!await this.check_miles_language()) {
          toast.error('toast.milesLanguageNotFound');
          return false;
        }

        await this.persist_launch_options();
        const videoOk = await this.apply_apex_video_config({ silent: true });
        if (videoOk) {
          toast.success('apexQuickPreset.applySuccess');
          this.close_quick_preset_dialog();
        } else {
          toast.error('apexQuickPreset.applyError');
        }
        return videoOk;
      } catch (err) {
        console.warn('apply_quick_preset_persist failed', err);
        toast.error('apexQuickPreset.applyError');
        return false;
      } finally {
        this.quick_preset_applying = false;
      }
    },

    update_download_language_button_color() {
      if (!this.is_enabled_miles_language) {
        this.download_language_button_color = 'grey-darken-1';
        this.is_miles_language_ready = true;
      } else if (this.language === 'english') {//英文语言不需要下载操作
        this.download_language_button_color = 'green-lighten-4';
        this.is_miles_language_ready = true;
      } else if (this.is_enabled_miles_language) {
        this.check_miles_language().then((is_ok) => {
          this.is_miles_language_ready = is_ok;
          this.download_language_button_color = is_ok ? 'success' : 'error';
        });
      } else {
        this.download_language_button_color = 'info';
      }
    }
  },
  getters: {
    /** Steam + EA Desktop 合并账户(来自 steamStore / eaStore) */
    apex_accounts(): ApexLauncherAccount[] {
      const steam = steamStore();
      const ea = eaStore();
      return [
        ...steam.steam_users.map((user) => ({ kind: 'steam' as const, user })),
        ...ea.ea_desktop_users.map((user) => ({ kind: 'ea' as const, user })),
      ];
    },
    active_apex_account(state): ApexLauncherAccount | null {
      return resolveActiveApexAccount(this.apex_accounts, state.launcher_selection_key);
    },
    //启动参数,最终输入的参数 组合勾选项
    launch_options(state) {
      const items: any[] = [];
      const activeAcc = this.active_apex_account;
      const is_ea = activeAcc?.kind === 'ea';

      state.options_selection.forEach((item: SteamLaunchOptionsImpl) => {
        if (item?.identifier === 'lobby_max_fps') { //大厅fps
          items.push(`+lobby_max_fps ${state.lobby_max_fps}`);
        } else if (item?.identifier === 'reticle_color') {//准星颜色
          if (activeAcc) {
            if (is_ea) {
              items.push(`+reticle_color 2147483648-2147483648-2147483648`);
            } else {
              items.push('+reticle_color "2147483648 2147483648 2147483648"');
            }
          }
        } else if (item?.identifier === 'fov_scale') {//Fov缩放
          if (activeAcc) {
            if (is_ea) {
              items.push(`+cl_fovScale 1.7`);
            } else {
              items.push('+cl_fovScale "1.7"');
            }
          }
        } else if (item?.identifier === 'skip_intro_animation') {//跳过开场动画
          items.push('-novid');
          items.push('-dev');
        } else if (item?.identifier === 'forced_resolution') {//强制分辨率
          items.push(`-width ${state.width} -height ${state.height}`);
        } else if (item?.identifier === 'letterbox_aspect') {//宽高比
          items.push(`+mat_letterbox_aspect_min ${state.mat_letterbox_aspect_min}`);
          items.push(`+mat_letterbox_aspect_goal ${state.mat_letterbox_aspect_goal}`);
          items.push(`+mat_letterbox_aspect_threshold ${state.mat_letterbox_aspect_threshold}`);
        } else if (item?.parameter) {
          if (typeof item.parameter === 'string') {
            items.push(item.parameter);
          } else if (typeof item?.default_parameter === 'string') {
            items.push(item.default_parameter);
          } else {
            // parameter: ['-novid', '-dev']
          }
        } else if (item?.parameters) {//多个参数
          if (item.is_combination_parameters) {//组合参数 暂时只有input_mouse用
            const value = item
              .parameters
              .map((item: SteamLaunchOptionsImpl) => item?.parameter)
              .join(' ');
            items.push(value);
          } else if (item?.identifier) {
            const value: string = state.settings_config[item?.identifier];
            if (item.identifier === 'fps' && value.includes('X')) {
              const fps = state.fps.toString();
              items.push(`-freq ${fps}`);
              items.push(`+fps_max ${fps}`);
            } else {
              items.push(value);
            }
          }
        }
      });
      return items.join(' ');
    },
    //获取当前选择的语言标识符
    language(state) {
      const lsp = state.settings_config['miles_language'].split(' ');
      const language: string = lsp[lsp.length - 1]; // 拿后面的标识符
      return language;
    },
    language_depot(): string | null {
      if (this.language in ApexMilesLanguagesDepot) {
        return ApexMilesLanguagesDepot[this.language];
      }
      return null;
    },
    download_language_depot_command() {
      return `download_depot 1172470 ${this.language_depot}`;
    },
    is_enabled_miles_language(state) {
      return state.options_selection.includes(ApexMilesLanguages);
    },
    is_launch_options_modified(state): boolean {
      return state.original_launch_options !== '' && this.launch_options !== state.original_launch_options;
    },
    /** 当前是否存在选用了 Apex 预设之外档位的设置(需强制只读保护) */
    has_out_of_preset_selection(state): boolean {
      const read = (identifier: string): string =>
        state.video_config_values[identifier]
          ?? state.video_config_values[`"${identifier}"`]
          ?? '';
      for (const row of ApexVideoConfig) {
        if (!isApexVideoConfigImpl(row)) continue;
        if (!row.options?.length) continue;
        for (const option of row.options) {
          if (!option.outOfPreset) continue;
          const matched = Object.entries(option.values).every(([key, value]) =>
            video_config_value_equals(read(key), value),
          );
          if (matched) return true;
        }
      }
      return false;
    },
    is_video_config_modified(state): boolean {
      const keys = new Set([
        ...Object.keys(state.original_video_config),
        ...Object.keys(state.video_config_values),
      ]);
      for (const key of keys) {
        if (state.original_video_config[key] !== state.video_config_values[key]) {
          return true;
        }
      }
      return false;
    },
    is_launch_page(state): boolean {
      return state.page_type === ApexPageTypeEnum.launch;
    },
    is_video_config_page(state): boolean {
      return state.page_type === ApexPageTypeEnum.video_config;
    },
    active_account_is_ea(): boolean {
      return this.active_apex_account?.kind === 'ea';
    },
    active_account_is_steam(): boolean {
      return this.active_apex_account?.kind === 'steam';
    },
    open_apex_url(): string {
      if (this.active_account_is_ea) {
        return 'origin://launchgame/194908';
      }
      return 'steam://rungameid/1172470';
    },
  },
  tauri: {
    autoStart: true,
    filterKeysStrategy: 'pick',
    filterKeys: [
      'launcher_selection_key',
      'page_type',
      'filter_type',
      'filter_search',
      'video_filter_type',
      'video_filter_search',
      'video_individual_input',
    ],
  },
});
export default apexStore;
