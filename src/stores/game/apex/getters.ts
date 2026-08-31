import {
  ApexMilesLanguages,
  ApexMilesLanguagesDepot,
} from '@/data/apex_launch_options_config.ts';
import ApexVideoConfig from '@/data/apex_video_config.ts';
import {ApexPageTypeEnum} from '@/enum.ts';
import type {ApexLauncherAccount} from '@/types/apex.ts';
import {
  isApexVideoConfigImpl,
} from '@/types/apex.ts';
import {useEaStore} from '@/stores/game/ea.ts';
import {useSteamStore} from '@/stores/game/steam.ts';
import {buildApexLaunchOptionsString} from '@/utils/game/apex_launch_build.ts';
import {
  resolveActiveApexAccount,
  videoConfigValueEquals,
} from '@/utils/game/apex_store_helpers.ts';
import type {ApexGetters, ApexState, ApexStoreThis} from './types.ts';

const video_config_value_equals = videoConfigValueEquals;

export const apexGetters: ApexGetters = {
  /** Steam + EA Desktop 合并账户(来自 steamStore / eaStore) */
  apex_accounts(): ApexLauncherAccount[] {
    const steam = useSteamStore();
    const ea = useEaStore();
    return [
      ...steam.steam_users.map((user) => ({ kind: 'steam' as const, user })),
      ...ea.ea_desktop_users.map((user) => ({ kind: 'ea' as const, user })),
    ];
  },
  active_apex_account(this: ApexStoreThis, state: ApexState): ApexLauncherAccount | null {
    return resolveActiveApexAccount(this.apex_accounts, state.launcher_selection_key);
  },
  //启动参数,最终输入的参数 组合勾选项
  launch_options(this: ApexStoreThis, state: ApexState) {
    const activeAcc = this.active_apex_account;
    return buildApexLaunchOptionsString({
      options_selection: state.options_selection,
      settings_config: state.settings_config,
      custom_launch_options: state.custom_launch_options,
      lobby_max_fps: state.lobby_max_fps,
      width: state.width,
      height: state.height,
      mat_letterbox_aspect_min: state.mat_letterbox_aspect_min,
      mat_letterbox_aspect_goal: state.mat_letterbox_aspect_goal,
      mat_letterbox_aspect_threshold: state.mat_letterbox_aspect_threshold,
      fps: state.fps,
      activeAcc,
    });
  },
  //获取当前选择的语言标识符
  language(state: ApexState) {
    const lsp = state.settings_config['miles_language'].split(' ');
    const language: string = lsp[lsp.length - 1]; // 拿后面的标识符
    return language;
  },
  language_depot(this: ApexStoreThis): string | null {
    const language = this.language;
    if (language in ApexMilesLanguagesDepot) {
      return ApexMilesLanguagesDepot[language];
    }
    return null;
  },
  download_language_depot_command(this: ApexStoreThis) {
    return `download_depot 1172470 ${this.language_depot}`;
  },
  is_enabled_miles_language(state: ApexState) {
    return state.options_selection.includes(ApexMilesLanguages);
  },
  is_launch_options_modified(this: ApexStoreThis, state: ApexState): boolean {
    // 磁盘上原本就是空启动项时 original 也为 ''，仍应能检测勾选后的变更
    if (!state.launch_loaded_for_key || state.launch_loaded_for_key !== this.launcher_selection_key) {
      return false;
    }
    return this.launch_options !== state.original_launch_options;
  },
  /** 当前是否存在选用了 Apex 预设之外档位的设置(需强制只读保护) */
  has_out_of_preset_selection(state: ApexState): boolean {
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
  is_video_config_modified(state: ApexState): boolean {
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
  is_game_settings_modified(state: ApexState): boolean {
    for (const file of ['settings', 'profile'] as const) {
      for (const [key, value] of Object.entries(state.game_settings_values[file])) {
        if (state.original_game_settings_values[file][key] !== value) return true;
      }
    }
    return state.game_settings_bindings.some(
      binding => state.original_game_settings_bindings[binding.id] !== binding.input,
    );
  },
  is_launch_page(state: ApexState): boolean {
    return state.page_type === ApexPageTypeEnum.launch;
  },
  is_video_config_page(state: ApexState): boolean {
    return state.page_type === ApexPageTypeEnum.video_config;
  },
  is_game_settings_page(state: ApexState): boolean {
    return state.page_type === ApexPageTypeEnum.game_settings;
  },
  active_account_is_ea(this: ApexStoreThis): boolean {
    return this.active_apex_account?.kind === 'ea';
  },
  active_account_is_steam(this: ApexStoreThis): boolean {
    return this.active_apex_account?.kind === 'steam';
  },
  open_apex_url(this: ApexStoreThis): string {
    return 'steam://rungameid/1172470';
  },
};
