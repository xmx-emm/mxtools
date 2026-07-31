import type {Store} from 'pinia';
import type {Component} from 'vue';
import type {ApexPageTypeEnum} from '@/enum.ts';
import type {ApexLauncherAccount, ApexVideoConfigImpl} from '@/types/apex.ts';
import type {
  ApexBinding,
  ApexGameSettingsFile,
} from '@/types/apex_game_settings.ts';
import type {
  ApexConfigSnapshot,
  ApexConfigSnapshotApplySelection,
  ApexConfigSnapshotExportSelection,
} from '@/types/apex_config_snapshot.ts';
import type {ApexQuickPresetSelection, PrimaryDisplayInfo} from '@/types/apex_quick_preset.ts';
import type {DvsConstraintTrigger} from '@/utils/apex_dvs.ts';
import type {ApexConfigMutationMeta} from '@/types/apex_history.ts';
import type {ApexConfigHistoryEntry} from '@/types/apex_history.ts';
import type {createApexState} from './state.ts';

export type ApexVideoWindowMode = 'fullscreen' | 'windowed' | 'borderless';

export type ApexState = ReturnType<typeof createApexState>;

/** Getter 函数签名（作为 Store 的 G；访问时 unwrap 为返回值） */
export type ApexGetters = {
  apex_accounts: () => ApexLauncherAccount[];
  active_apex_account: (state: ApexState) => ApexLauncherAccount | null;
  launch_options: (state: ApexState) => string;
  language: (state: ApexState) => string;
  language_depot: () => string | null;
  download_language_depot_command: () => string;
  is_enabled_miles_language: (state: ApexState) => boolean;
  is_launch_options_modified: (state: ApexState) => boolean;
  has_out_of_preset_selection: (state: ApexState) => boolean;
  is_video_config_modified: (state: ApexState) => boolean;
  is_game_settings_modified: (state: ApexState) => boolean;
  is_launch_page: (state: ApexState) => boolean;
  is_video_config_page: (state: ApexState) => boolean;
  is_game_settings_page: (state: ApexState) => boolean;
  active_account_is_ea: () => boolean;
  active_account_is_steam: () => boolean;
  open_apex_url: () => string;
};

export type ApexActions = {
  closeTip(): void;
  showTip(item: {
    tip?: Component | null | undefined;
    tipProps?: Record<string, unknown>;
  }): void;
  start_launch(force?: boolean): void;
  load_launch_data(options?: {force?: boolean}): Promise<void>;
  reload_launch_page(): Promise<void>;
  parse_loaded_launch_string(start_launch_option: string): void;
  start_load_apex_launch_options_data(
    expectedKey?: string | null,
    expectedGeneration?: number,
  ): Promise<boolean>;
  persist_launch_options(meta?: ApexConfigMutationMeta): Promise<void>;
  set_active_apex_account(acc: ApexLauncherAccount): void;
  refresh_apex_accounts(options?: { silent?: boolean }): Promise<void>;
  set_page_type(page: ApexPageTypeEnum): void;
  check_miles_language(force?: boolean): Promise<boolean>;
  update_download_language_button_color(): void;
  load_apex_video_config(options?: {silent?: boolean; force?: boolean}): Promise<void>;
  start_video_config(force?: boolean): void;
  set_video_config_value(identifier: string, value: string): void;
  sync_dvs_related_settings(trigger: DvsConstraintTrigger): void;
  set_dvs_fps_target(target: number): void;
  get_video_config_value(identifier: string): string;
  get_video_config_bool(identifier: string, onValue?: string): boolean;
  set_video_config_bool(
    identifier: string,
    enabled: boolean,
    onValue?: string,
    offValue?: string,
  ): void;
  get_video_config_enum(item: ApexVideoConfigImpl): number;
  set_video_config_enum(item: ApexVideoConfigImpl, optionIndex: number): void;
  get_video_config_number(identifier: string, fallback?: number): number;
  set_video_config_number(
    identifier: string,
    value: number,
    valueType: 'integer' | 'float',
  ): void;
  get_video_config_parameter_info(item: ApexVideoConfigImpl): string;
  get_video_config_window_mode(): ApexVideoWindowMode;
  set_video_config_window_mode(mode: ApexVideoWindowMode): void;
  build_video_config_updates(): Record<string, string>;
  apply_apex_video_config(options?: {silent?: boolean} & ApexConfigMutationMeta): Promise<boolean>;
  load_videoconfig_readonly(): Promise<void>;
  set_videoconfig_readonly(locked: boolean): Promise<boolean>;
  load_apex_game_settings(options?: {
    silent?: boolean
    force?: boolean
    discardLocal?: boolean
  }): Promise<void>;
  start_game_settings(force?: boolean): void;
  set_game_setting_value(file: ApexGameSettingsFile, key: string, value: string): void;
  set_game_binding_slot(
    templateId: string,
    bindingId: string | null,
    input: string,
    context: 0 | 1,
  ): void;
  apply_apex_game_settings(options?: {silent?: boolean} & ApexConfigMutationMeta): Promise<boolean>;
  restore_apex_game_settings(restoreSettings: boolean, restoreProfile: boolean): Promise<boolean>;
  replace_game_settings_bindings(bindings: ApexBinding[]): void;
  open_quick_preset_window(): void;
  open_apex_q_dialog(): void;
  close_apex_q_dialog(): void;
  set_quick_preset_display(info: PrimaryDisplayInfo | null): void;
  prepare_quick_preset(screen: PrimaryDisplayInfo, selection: ApexQuickPresetSelection): void;
  ensure_configs_loaded_for_preset(): Promise<void>;
  apply_quick_preset_persist(): Promise<boolean>;
  open_config_export_dialog(): void;
  close_config_export_dialog(): void;
  open_config_import_dialog(): void;
  close_config_import_dialog(): void;
  set_config_import_snapshot(snapshot: ApexConfigSnapshot | null): void;
  ensure_configs_loaded_for_snapshot(): Promise<void>;
  build_config_snapshot(selection: ApexConfigSnapshotExportSelection): Promise<ApexConfigSnapshot>;
  export_config_snapshot_to_file(
    path: string,
    selection: ApexConfigSnapshotExportSelection,
  ): Promise<void>;
  apply_config_snapshot(
    snapshot: ApexConfigSnapshot,
    selection: ApexConfigSnapshotApplySelection,
  ): Promise<boolean>;
  open_config_history_dialog(): void;
  close_config_history_dialog(): void;
  open_reset_defaults_dialog(): void;
  close_reset_defaults_dialog(): void;
  load_config_history(): Promise<void>;
  restore_config_history(entry: ApexConfigHistoryEntry): Promise<boolean>;
  reset_apex_to_defaults(): Promise<boolean>;
};

export type ApexStore = Store<'apex', ApexState, ApexGetters, ApexActions>;
export type ApexStoreThis = ApexStore;
