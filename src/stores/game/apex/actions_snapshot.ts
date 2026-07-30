import {useToast} from 'vue-toastification';
import {
  apexIsRunning,
  mutateApexConfig,
  writeUtf8File,
} from '@/ipc/commands.ts';
import type {
  ApexConfigSnapshot,
  ApexConfigSnapshotApplySelection,
  ApexConfigSnapshotExportSelection,
} from '@/types/apex_config_snapshot.ts';
import {
  buildApexConfigSnapshot,
  buildVideoConfigPreviewItems,
  collectApexGameSettingsGroups,
  collectSelectedVideoUpdates,
  stringifyApexConfigSnapshot,
  type ApexConfigSnapshotSettingsGroup,
} from '@/utils/game/apex_config_snapshot.ts';
import type {ApexStoreThis} from './types.ts';
import {
  createApexHistoryTransactionId,
  toApexLauncherRef,
} from '@/utils/game/apex_history.ts';
import {normalizeVideoConfigMap} from '@/utils/game/apex_store_helpers.ts';
import {
  adoptApexGameSettingsReport,
} from './actions_settings.ts';

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
    const report = this.game_settings_report;
    if (!report) {
      throw new Error('apex.gameSettings.errors.readFailed');
    }
    const unknownSettings = new Set(report.settings.unknownKeys);
    const unknownProfile = new Set(report.profile.unknownKeys);
    const settings = Object.fromEntries(
      Object.entries(this.game_settings_values.settings)
        .filter(([key]) => !unknownSettings.has(key)),
    );
    const profile = Object.fromEntries(
      Object.entries(this.game_settings_values.profile)
        .filter(([key]) => !unknownProfile.has(key)),
    );
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
    const transactionId = createApexHistoryTransactionId();
    if (!selection.importLaunchOptions && !selection.importVideoConfig
      && !selection.importGameSettings && !selection.importAiming
      && !selection.importController && !selection.importBindings) {
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
      || ((selection.importGameSettings || selection.importAiming
        || selection.importController || selection.importBindings) && snapshot.gameSettings)) {
      const running = await apexIsRunning().catch(() => false);
      if (running) {
        toast.error('apex.apexRunningVideoConfig');
        return false;
      }
    }

    this.is_config_snapshot_applying = true;
    try {
      let videoUpdates: Record<string, string> = {};
      if (selection.importVideoConfig && snapshot.videoConfig) {
        if (selection.videoSelectMode === 'all') {
          videoUpdates = {...snapshot.videoConfig};
        } else {
          const items = buildVideoConfigPreviewItems(snapshot.videoConfig);
          videoUpdates = collectSelectedVideoUpdates(
            snapshot.videoConfig,
            items,
            selection.selectedVideoItemIds,
          );
          if (Object.keys(videoUpdates).length === 0) {
            toast.warning('apex.configSnapshot.errors.noVideoItemsSelected');
            return false;
          }
        }
      }

      let gameSettings = null;
      if ((selection.importGameSettings || selection.importAiming
        || selection.importController || selection.importBindings) && snapshot.gameSettings) {
        if (!this.game_settings_report) {
          await this.load_apex_game_settings();
        }
        if (!this.game_settings_report) {
          throw new Error('apex.gameSettings.errors.readFailed');
        }
        const report = this.game_settings_report;
        const nextSettings = {...this.game_settings_values.settings};
        const nextProfile = {...this.game_settings_values.profile};
        const selectedGroups: ApexConfigSnapshotSettingsGroup[] = [];
        if (selection.importGameSettings) selectedGroups.push('gameSettings');
        if (selection.importAiming) selectedGroups.push('aiming');
        if (selection.importController) selectedGroups.push('controller');
        const selectedSettings = collectApexGameSettingsGroups(
          snapshot.gameSettings,
          selectedGroups,
        );
        if (selectedGroups.length > 0) {
          for (const [key, value] of Object.entries(selectedSettings.settings)) {
            nextSettings[key] = value;
          }
          for (const [key, value] of Object.entries(selectedSettings.profile)) {
            nextProfile[key] = value;
          }
        }
        const nextBindingInputs = Object.fromEntries(
          this.game_settings_bindings.map(binding => [binding.id, binding.input]),
        );
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
            nextBindingInputs[current.id] = saved.input;
          }
        }
        gameSettings = {
          settingsRevision: report.settings.revision,
          profileRevision: report.profile.revision,
          settingsUpdates: Object.fromEntries(
            Object.entries(nextSettings).filter(([key, value]) => (
              this.original_game_settings_values.settings[key] !== value
            )),
          ),
          profileUpdates: Object.fromEntries(
            Object.entries(nextProfile).filter(([key, value]) => (
              this.original_game_settings_values.profile[key] !== value
            )),
          ),
          bindingUpdates: this.game_settings_bindings
            .filter(binding => (
              this.original_game_settings_bindings[binding.id] !== nextBindingInputs[binding.id]
            ))
            .map(binding => ({id: binding.id, input: nextBindingInputs[binding.id]})),
        };
      }

      const account = this.active_apex_account;
      const launchOptions = selection.importLaunchOptions && snapshot.launchOptions
        ? snapshot.launchOptions.raw
        : null;
      const result = await mutateApexConfig({request: {
        source: 'import',
        transactionId,
        launcher: launchOptions && account ? toApexLauncherRef(account) : null,
        launchOptions,
        videoUpdates,
        gameSettings,
      }});

      if (launchOptions !== null) {
        this.parse_loaded_launch_string(launchOptions);
        this.original_launch_options = launchOptions;
        this.launch_loaded_for_key = this.launcher_selection_key;
        this.launch_load_status = 'ready';
      }
      if (selection.importVideoConfig && snapshot.videoConfig) {
        const values = result.videoConfig
          ? normalizeVideoConfigMap(result.videoConfig)
          : {...this.video_config_values, ...videoUpdates};
        this.video_config_values = {...values};
        this.original_video_config = {...values};
        this.video_config_loaded = true;
        this.video_config_loaded_key = 'machine';
        this.video_config_load_status = 'ready';
        if (this.has_out_of_preset_selection) {
          await this.set_videoconfig_readonly(true);
          toast.info('apex.outOfPresetAutoLocked');
        } else {
          await this.load_videoconfig_readonly();
        }
      }
      if (result.gameSettingsReport) {
        adoptApexGameSettingsReport(this, result.gameSettingsReport);
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
