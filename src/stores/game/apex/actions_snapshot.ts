import {useToast} from 'vue-toastification';
import {
  apexIsRunning,
  setApexVideoConfig,
  writeUtf8File,
} from '@/ipc/commands.ts';
import ApexGameSettingsData from '@/data/apex_game_settings.ts';
import type {
  ApexConfigSnapshot,
  ApexConfigSnapshotApplySelection,
  ApexConfigSnapshotExportSelection,
} from '@/types/apex_config_snapshot.ts';
import {
  buildApexConfigSnapshot,
  buildVideoConfigPreviewItems,
  collectSelectedVideoUpdates,
  stringifyApexConfigSnapshot,
} from '@/utils/game/apex_config_snapshot.ts';
import type {ApexStoreThis} from './types.ts';

export const apexSnapshotActions = {
  open_config_export_dialog(this: ApexStoreThis) {
    this.config_export_dialog = true;
  },
  close_config_export_dialog(this: ApexStoreThis) {
    this.config_export_dialog = false;
  },
  open_config_import_dialog(this: ApexStoreThis) {
    this.config_import_dialog = true;
  },
  close_config_import_dialog(this: ApexStoreThis) {
    this.config_import_dialog = false;
    this.config_import_snapshot = null;
  },
  set_config_import_snapshot(this: ApexStoreThis, snapshot: ApexConfigSnapshot | null) {
    this.config_import_snapshot = snapshot;
  },

  /** 确保导出所需数据已加载 */
  async ensure_configs_loaded_for_snapshot(this: ApexStoreThis): Promise<void> {
    const key = this.launcher_selection_key;
    if (!key || this.launch_loaded_for_key !== key) {
      const ok = await this.start_load_apex_launch_options_data();
      if (!ok) {
        throw new Error('LAUNCH_OPTIONS_LOAD_FAILED');
      }
      this.original_launch_options = this.launch_options;
      this.launch_loaded_for_key = this.launcher_selection_key;
    }
    if (!this.video_config_loaded || Object.keys(this.video_config_values).length === 0) {
      await this.load_apex_video_config();
    }
    if (!this.game_settings_loaded || !this.game_settings_report) {
      await this.load_apex_game_settings();
    }
  },

  async build_config_snapshot(
    this: ApexStoreThis,
    selection: ApexConfigSnapshotExportSelection,
  ): Promise<ApexConfigSnapshot> {
    await this.ensure_configs_loaded_for_snapshot();
    const settings: Record<string, string> = {};
    const profile: Record<string, string> = {};
    for (const field of ApexGameSettingsData) {
      const value = this.game_settings_values[field.file][field.key];
      if (value !== undefined) {
        (field.file === 'settings' ? settings : profile)[field.key] = value;
      }
    }
    return buildApexConfigSnapshot({
      selection,
      launchOptionsRaw: this.launch_options,
      videoConfig: {...this.video_config_values},
      gameSettings: {
        settings,
        profile,
        bindings: this.game_settings_bindings
          .filter(binding => binding.editable)
          .map(binding => ({
            input: binding.input,
            command: binding.command,
            context: binding.context,
            heldCommand: binding.heldCommand,
            occurrence: binding.occurrence,
          })),
      },
    });
  },

  async export_config_snapshot_to_file(
    this: ApexStoreThis,
    path: string,
    selection: ApexConfigSnapshotExportSelection,
  ): Promise<void> {
    const snapshot = await this.build_config_snapshot(selection);
    await writeUtf8File({
      path,
      content: stringifyApexConfigSnapshot(snapshot),
    });
  },

  /**
   * 应用快照到当前账号 / videoconfig。
   * 启动项：parse + persist（整串语义，经 Store 规范化）。
   * 视频：patch 选中键；含 Apex 运行中检查。
   */
  async apply_config_snapshot(
    this: ApexStoreThis,
    snapshot: ApexConfigSnapshot,
    selection: ApexConfigSnapshotApplySelection,
  ): Promise<boolean> {
    const toast = useToast();
    if (!selection.importLaunchOptions && !selection.importVideoConfig
      && !selection.importGameSettings && !selection.importBindings) {
      toast.warning('apex.configSnapshot.errors.nothingSelected');
      return false;
    }

    if (selection.importLaunchOptions && snapshot.launchOptions) {
      if (!this.active_apex_account) {
        toast.error('apex.noLauncherAccount');
        return false;
      }
      if (!await this.check_miles_language()) {
        toast.error('toast.milesLanguageNotFound');
        if (this.active_apex_account?.kind === 'ea') {
          this.download_miles_language_manual_dialog_ea = true;
        } else {
          this.download_miles_language_semi_automatic_dialog = true;
        }
        return false;
      }
    }

    if ((selection.importVideoConfig && snapshot.videoConfig)
      || ((selection.importGameSettings || selection.importBindings) && snapshot.gameSettings)) {
      const running = await apexIsRunning().catch(() => false);
      if (running) {
        toast.error('apex.apexRunningVideoConfig');
        return false;
      }
    }

    this.is_config_snapshot_applying = true;
    try {
      if (selection.importLaunchOptions && snapshot.launchOptions) {
        this.parse_loaded_launch_string(snapshot.launchOptions.raw);
        await this.persist_launch_options();
      }

      if (selection.importVideoConfig && snapshot.videoConfig) {
        let updates: Record<string, string>;
        if (selection.videoSelectMode === 'all') {
          updates = {...snapshot.videoConfig};
        } else {
          const items = buildVideoConfigPreviewItems(snapshot.videoConfig);
          updates = collectSelectedVideoUpdates(
            snapshot.videoConfig,
            items,
            selection.selectedVideoItemIds,
          );
          if (Object.keys(updates).length === 0) {
            toast.warning('apex.configSnapshot.errors.noVideoItemsSelected');
            return false;
          }
        }

        await setApexVideoConfig({updates});
        this.video_config_values = {
          ...this.video_config_values,
          ...updates,
        };
        this.original_video_config = {...this.video_config_values};
        this.video_config_loaded = true;

        if (this.has_out_of_preset_selection) {
          try {
            await this.set_videoconfig_readonly(true);
            toast.info('apex.outOfPresetAutoLocked');
          } catch (e) {
            console.warn('force readonly after snapshot import failed', e);
          }
        } else {
          await this.load_videoconfig_readonly();
        }
      }

      if ((selection.importGameSettings || selection.importBindings) && snapshot.gameSettings) {
        if (!this.game_settings_report) {
          await this.load_apex_game_settings();
        }
        if (!this.game_settings_report) {
          throw new Error('apex.gameSettings.errors.readFailed');
        }
        if (selection.importGameSettings) {
          for (const [key, value] of Object.entries(snapshot.gameSettings.settings)) {
            this.set_game_setting_value('settings', key, value);
          }
          for (const [key, value] of Object.entries(snapshot.gameSettings.profile)) {
            this.set_game_setting_value('profile', key, value);
          }
        }
        if (selection.importBindings) {
          for (const saved of snapshot.gameSettings.bindings ?? []) {
            const current = this.game_settings_bindings.find(binding => (
              binding.editable
              && binding.command === saved.command
              && binding.context === saved.context
              && binding.occurrence === saved.occurrence
              && (binding.heldCommand ?? null) === (saved.heldCommand ?? null)
            ));
            if (!current) {
              throw new Error(`apex.gameSettings.errors.bindingMissing: ${saved.command}`);
            }
            this.set_game_binding_input(current.id, saved.input);
          }
        }
        if (!await this.apply_apex_game_settings({silent: true})) {
          return false;
        }
      }

      toast.success('toast.importApexConfigSnapshotSuccess');
      return true;
    } catch (err) {
      console.warn('apply_config_snapshot failed', err);
      const detail = (err instanceof Error ? err.message : String(err ?? '')).trim();
      toast.error(
        detail
          ? `toast.importApexConfigSnapshotError\n${detail}`
          : 'toast.importApexConfigSnapshotError',
        {timeout: 8000},
      );
      return false;
    } finally {
      this.is_config_snapshot_applying = false;
    }
  },
};
