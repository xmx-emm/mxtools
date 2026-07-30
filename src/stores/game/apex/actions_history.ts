import {useToast} from 'vue-toastification';
import {
  listApexConfigHistory,
  resetApexToGameDefaults,
  restoreApexConfigHistory,
} from '@/ipc/commands.ts';
import type {ApexConfigHistoryEntry} from '@/types/apex_history.ts';
import {toApexLauncherRef} from '@/utils/game/apex_history.ts';
import {normalizeVideoConfigMap} from '@/utils/game/apex_store_helpers.ts';
import type {ApexStoreThis} from './types.ts';
import {adoptApexGameSettingsReport} from './actions_settings.ts';

export const apexHistoryActions = {
  open_config_history_dialog(this: ApexStoreThis) {
    this.config_history_dialog = true;
  },

  close_config_history_dialog(this: ApexStoreThis) {
    this.config_history_dialog = false;
  },

  open_reset_defaults_dialog(this: ApexStoreThis) {
    this.reset_defaults_dialog = true;
  },

  close_reset_defaults_dialog(this: ApexStoreThis) {
    this.reset_defaults_dialog = false;
  },

  async load_config_history(this: ApexStoreThis) {
    if (this.is_config_history_loading) return;
    this.is_config_history_loading = true;
    try {
      this.config_history = await listApexConfigHistory();
    } catch (error) {
      console.warn('list apex config history failed', error);
      useToast().error(String(error));
    } finally {
      this.is_config_history_loading = false;
    }
  },

  async restore_config_history(
    this: ApexStoreThis,
    entry: ApexConfigHistoryEntry,
  ): Promise<boolean> {
    if (this.is_config_history_restoring) return false;
    const account = this.active_apex_account;
    if (entry.scopes.includes('launch') && !account) {
      useToast().error('apex.noLauncherAccount');
      return false;
    }
    this.is_config_history_restoring = true;
    try {
      const result = await restoreApexConfigHistory({
        request: {
          entryId: entry.id,
          launcher: account ? toApexLauncherRef(account) : null,
        },
      });
      if (result.restoredScopes.includes('launch') && result.launchOptions !== null) {
        this.parse_loaded_launch_string(result.launchOptions);
        this.original_launch_options = result.launchOptions;
        this.launch_loaded_for_key = this.launcher_selection_key;
        this.launch_load_status = 'ready';
      }
      if (result.videoConfig) {
        const values = normalizeVideoConfigMap(result.videoConfig);
        this.video_config_values = {...values};
        this.original_video_config = {...values};
        this.video_config_loaded = true;
        this.video_config_loaded_key = 'machine';
        this.video_config_load_status = 'ready';
        await this.load_videoconfig_readonly();
      } else if (result.restoredScopes.includes('video')) {
        this.video_config_values = {};
        this.original_video_config = {};
        this.video_config_loaded = false;
        this.video_config_loaded_key = null;
        this.video_config_load_status = 'idle';
      }
      if (result.gameSettingsReport) {
        adoptApexGameSettingsReport(this, result.gameSettingsReport);
      } else if (result.restoredScopes.includes('gameSettings')) {
        this.game_settings_report = null;
        this.game_settings_values = {settings: {}, profile: {}};
        this.original_game_settings_values = {settings: {}, profile: {}};
        this.game_settings_bindings = [];
        this.original_game_settings_bindings = {};
        this.game_settings_loaded = false;
        this.game_settings_loaded_key = null;
        this.game_settings_load_status = 'idle';
      }
      this.reset_pending_scopes = [...result.pendingScopes];
      await this.load_config_history();
      useToast().success('apex.history.restoreSuccess');
      return true;
    } catch (error) {
      console.warn('restore apex config history failed', error);
      useToast().error(String(error), {timeout: 8000});
      return false;
    } finally {
      this.is_config_history_restoring = false;
    }
  },

  async reset_apex_to_defaults(this: ApexStoreThis): Promise<boolean> {
    const account = this.active_apex_account;
    if (!account || this.is_resetting_defaults) {
      if (!account) useToast().error('apex.noLauncherAccount');
      return false;
    }
    this.is_resetting_defaults = true;
    try {
      const result = await resetApexToGameDefaults({
        launcher: toApexLauncherRef(account),
      });
      this.options_selection = [];
      this.original_launch_options = '';
      this.launch_loaded_for_key = this.launcher_selection_key;
      this.launch_load_status = 'ready';
      this.video_config_request_generation += 1;
      this.video_config_values = {};
      this.original_video_config = {};
      this.video_config_loaded = false;
      this.video_config_loaded_key = null;
      this.video_config_load_status = 'idle';
      this.is_video_config_loading = false;
      this.game_settings_request_generation += 1;
      this.game_settings_report = null;
      this.game_settings_values = {settings: {}, profile: {}};
      this.original_game_settings_values = {settings: {}, profile: {}};
      this.game_settings_bindings = [];
      this.original_game_settings_bindings = {};
      this.game_settings_loaded = false;
      this.game_settings_loaded_key = null;
      this.game_settings_load_status = 'idle';
      this.is_game_settings_loading = false;
      this.reset_pending_scopes = [...result.pendingScopes];
      this.reset_defaults_dialog = false;
      await this.load_config_history();
      useToast().success('apex.history.resetSuccess');
      return true;
    } catch (error) {
      console.warn('reset apex defaults failed', error);
      useToast().error(String(error), {timeout: 8000});
      return false;
    } finally {
      this.is_resetting_defaults = false;
    }
  },
};
