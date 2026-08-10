import {useToast} from 'vue-toastification';
import {
  apexIsRunning,
  checkApexMilesLanguage,
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
  omitApexGameManagedVideoConfig,
  stringifyApexConfigSnapshot,
  type ApexConfigSnapshotSettingsGroup,
} from '@/utils/game/apex_config_snapshot.ts';
import type {ApexStoreThis} from './types.ts';
import type {
  ApexBinding,
  ApexBindingMutation,
  ApexBindingSnapshot,
} from '@/types/apex_game_settings.ts';
import {
  createApexHistoryTransactionId,
  toApexLauncherRef,
} from '@/utils/game/apex_history.ts';
import {normalizeVideoConfigMap} from '@/utils/game/apex_store_helpers.ts';
import {
  adoptApexGameSettingsReport,
} from './actions_settings.ts';

const allSnapshotSources: ApexConfigSnapshotExportSelection = {
  launchOptions: true,
  videoConfig: true,
  gameSettings: true,
  aiming: true,
  controller: true,
  bindings: true,
};

const SNAPSHOT_LOAD_TIMEOUT_MS = 10_000;

function waitForSnapshotTick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 15));
}

async function waitForSnapshotLoad(options: {
  start: () => Promise<unknown> | unknown;
  loading: () => boolean;
  status: () => string;
  ready: () => boolean;
  error: string;
}): Promise<void> {
  const deadline = Date.now() + SNAPSHOT_LOAD_TIMEOUT_MS;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(options.start),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(options.error)),
          SNAPSHOT_LOAD_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
  while (options.loading()) {
    if (Date.now() >= deadline) throw new Error(options.error);
    await waitForSnapshotTick();
  }
  if (!options.ready() || options.status() === 'error') {
    throw new Error(options.error);
  }
}

function needsGameSettingsSource(selection: {
  gameSettings?: boolean;
  aiming?: boolean;
  controller?: boolean;
  bindings?: boolean;
}): boolean {
  return Boolean(
    selection.gameSettings
    || selection.aiming
    || selection.controller
    || selection.bindings,
  );
}

/** Load only the sources selected by an export/import operation. */
async function ensureSnapshotSourcesLoaded(
  store: ApexStoreThis,
  selection: {
    launchOptions?: boolean;
    videoConfig?: boolean;
    gameSettings?: boolean;
    aiming?: boolean;
    controller?: boolean;
    bindings?: boolean;
  },
): Promise<void> {
  if (selection.launchOptions) {
    const expectedKey = store.launcher_selection_key;
    if (!expectedKey) throw new Error('LAUNCH_OPTIONS_LOAD_FAILED');
    const loaded = store.launch_loaded_for_key === expectedKey
      && !store.is_start_loading
      && store.launch_load_status !== 'error';
    if (!loaded) {
      await waitForSnapshotLoad({
        start: () => store.load_launch_data(),
        loading: () => store.is_start_loading,
        status: () => store.launch_load_status,
        ready: () => store.launch_loaded_for_key === expectedKey,
        error: 'LAUNCH_OPTIONS_LOAD_FAILED',
      });
    }
  }

  if (selection.videoConfig) {
    const loaded = store.video_config_loaded
      && !store.is_video_config_loading
      && store.video_config_load_status !== 'error';
    if (!loaded) {
      await waitForSnapshotLoad({
        start: () => store.load_apex_video_config({silent: true}),
        loading: () => store.is_video_config_loading,
        status: () => store.video_config_load_status,
        ready: () => store.video_config_loaded,
        error: 'VIDEO_CONFIG_LOAD_FAILED',
      });
    }
  }

  if (needsGameSettingsSource(selection)) {
    const loaded = store.game_settings_loaded
      && Boolean(store.game_settings_report)
      && !store.is_game_settings_loading
      && store.game_settings_load_status !== 'error';
    if (!loaded) {
      await waitForSnapshotLoad({
        start: () => store.load_apex_game_settings({silent: true}),
        loading: () => store.is_game_settings_loading,
        status: () => store.game_settings_load_status,
        ready: () => store.game_settings_loaded && Boolean(store.game_settings_report),
        error: 'GAME_SETTINGS_LOAD_FAILED',
      });
    }
  }
}

function bindingActionKey(binding: {
  command: string;
  heldCommand?: string | null;
}): string {
  return `${binding.command.toLowerCase()}\u001f${(binding.heldCommand ?? '').toLowerCase()}`;
}

function bindingIdentityKey(binding: {
  command: string;
  heldCommand?: string | null;
  context: number;
  occurrence: number;
}): string {
  return `${bindingActionKey(binding)}\u001f${binding.context}\u001f${binding.occurrence}`;
}

function normalizedBindingInput(input: string): string {
  return input.trim().toUpperCase();
}

/** Reconcile the complete editable binding set, including missing context slots. */
function buildSnapshotBindingMutations(
  baseline: ApexBinding[],
  saved: ApexBindingSnapshot[],
): ApexBindingMutation[] {
  const mutations: ApexBindingMutation[] = [];
  const baselineEditable = baseline.filter(binding => binding.editable);
  const baselineByIdentity = new Map<string, ApexBinding>();
  for (const binding of baselineEditable) {
    const identity = bindingIdentityKey(binding);
    if (baselineByIdentity.has(identity)) {
      throw new Error(`apex.gameSettings.errors.duplicateBindingIdentity: ${binding.command}`);
    }
    baselineByIdentity.set(identity, binding);
  }

  const savedByIdentity = new Map<string, ApexBindingSnapshot>();
  const savedSlots = new Set<string>();
  const actionKeys = new Set(baselineEditable.map(bindingActionKey));
  for (const binding of saved) {
    const identity = bindingIdentityKey(binding);
    const slot = `${bindingActionKey(binding)}\u001f${binding.context}`;
    if (savedByIdentity.has(identity) || savedSlots.has(slot)) {
      throw new Error(`apex.gameSettings.errors.duplicateBindingIdentity: ${binding.command}`);
    }
    savedByIdentity.set(identity, binding);
    savedSlots.add(slot);
    actionKeys.add(bindingActionKey(binding));
  }

  for (const actionKey of actionKeys) {
    const current = baselineEditable.filter(binding => bindingActionKey(binding) === actionKey);
    const desired = saved.filter(binding => bindingActionKey(binding) === actionKey);
    const desiredByIdentity = new Map(
      desired.map(binding => [bindingIdentityKey(binding), binding]),
    );
    const template = current[0];
    if (!template) {
      throw new Error(`apex.gameSettings.errors.bindingMissing: ${desired[0]?.command ?? actionKey}`);
    }

    for (const binding of current) {
      const identity = bindingIdentityKey(binding);
      const wanted = desiredByIdentity.get(identity);
      if (!wanted) {
        mutations.push({operation: 'delete', id: binding.id});
      } else if (normalizedBindingInput(binding.input) !== normalizedBindingInput(wanted.input)) {
        mutations.push({operation: 'update', id: binding.id, input: wanted.input});
      }
    }

    for (const wanted of desired) {
      const identity = bindingIdentityKey(wanted);
      if (baselineByIdentity.has(identity)) continue;
      if (wanted.context !== 0 && wanted.context !== 1) {
        throw new Error(`apex.gameSettings.errors.invalidBindingContext: ${wanted.context}`);
      }
      mutations.push({
        operation: 'create',
        templateId: template.id,
        input: wanted.input,
        context: wanted.context,
      });
    }
  }

  return mutations;
}

function snapshotMilesLanguage(raw: string): string | null {
  const match = raw.match(/(?:^|\s)\+miles_language\s+([^\s]+)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

async function validateSnapshotLaunchLanguage(
  store: ApexStoreThis,
  raw: string,
): Promise<boolean> {
  const language = snapshotMilesLanguage(raw);
  if (!language || language === 'english') return true;
  const account = store.active_apex_account;
  if (!account) return false;
  return checkApexMilesLanguage({
    language,
    platform: account.kind === 'ea' ? 'ea' : 'steam',
    eaUserId: account.kind === 'ea' ? account.user.id : null,
  });
}

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
    await ensureSnapshotSourcesLoaded(this, allSnapshotSources);
  },

  async build_config_snapshot(
    this: ApexStoreThis,
    selection: ApexConfigSnapshotExportSelection,
  ): Promise<ApexConfigSnapshot> {
    await ensureSnapshotSourcesLoaded(this, selection);
    const needsGame = needsGameSettingsSource(selection);
    const report = needsGame ? this.game_settings_report : null;
    if (needsGame && !report) {
      throw new Error('apex.gameSettings.errors.readFailed');
    }
    const unknownSettings = new Set(report?.settings.unknownKeys ?? []);
    const unknownProfile = new Set(report?.profile.unknownKeys ?? []);
    const settings = needsGame
      ? Object.fromEntries(
        Object.entries(this.game_settings_values.settings)
          .filter(([key]) => !unknownSettings.has(key)),
      )
      : {};
    const profile = needsGame
      ? Object.fromEntries(
        Object.entries(this.game_settings_values.profile)
          .filter(([key]) => !unknownProfile.has(key)),
      )
      : {};
    return buildApexConfigSnapshot({
      selection,
      ...(selection.launchOptions ? {launchOptionsRaw: this.launch_options} : {}),
      ...(selection.videoConfig ? {videoConfig: {...this.video_config_values}} : {}),
      ...(needsGame ? {
        gameSettings: {
          settings,
          profile,
          bindings: this.game_settings_bindings
            .filter(binding => binding.editable && binding.input)
            .map(binding => ({
              input: binding.input,
              command: binding.command,
              context: binding.context,
              heldCommand: binding.heldCommand,
              occurrence: binding.occurrence,
            })),
        },
      } : {}),
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
    const importableVideoConfig = selection.importVideoConfig && snapshot.videoConfig
      ? omitApexGameManagedVideoConfig(snapshot.videoConfig)
      : null;
    const hasImportableVideoConfig = Boolean(
      importableVideoConfig && Object.keys(importableVideoConfig).length > 0,
    );

    if (selection.importLaunchOptions && snapshot.launchOptions) {
      if (!this.active_apex_account) {
        toast.error('apex.noLauncherAccount');
        return false;
      }
      if (!await validateSnapshotLaunchLanguage(this, snapshot.launchOptions.raw)) {
        toast.error('toast.milesLanguageNotFound');
        if (this.active_apex_account?.kind === 'ea') {
          this.download_miles_language_manual_dialog_ea = true;
        } else {
          this.download_miles_language_semi_automatic_dialog = true;
        }
        return false;
      }
    }

    if (hasImportableVideoConfig
      || ((selection.importGameSettings || selection.importAiming
        || selection.importController || selection.importBindings) && snapshot.gameSettings)) {
      const running = await apexIsRunning();
      if (running) {
        toast.error('apex.apexRunningVideoConfig');
        return false;
      }
    }

    this.is_config_snapshot_applying = true;
    try {
      await ensureSnapshotSourcesLoaded(this, {
        // Launch validation uses the candidate snapshot text directly.  Do
        // not force a second read of the current launcher value here.
        launchOptions: false,
        videoConfig: hasImportableVideoConfig,
        gameSettings: selection.importGameSettings && Boolean(snapshot.gameSettings),
        aiming: selection.importAiming && Boolean(snapshot.gameSettings),
        controller: selection.importController && Boolean(snapshot.gameSettings),
        bindings: selection.importBindings && Boolean(snapshot.gameSettings),
      });
      let videoUpdates: Record<string, string> = {};
      if (hasImportableVideoConfig && importableVideoConfig) {
        if (selection.videoSelectMode === 'all') {
          videoUpdates = importableVideoConfig;
        } else {
          const items = buildVideoConfigPreviewItems(importableVideoConfig);
          videoUpdates = collectSelectedVideoUpdates(
            importableVideoConfig,
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
          throw new Error('apex.gameSettings.errors.readFailed');
        }
        const report = this.game_settings_report;
        // Start from the last clean report so unrelated local drafts cannot
        // leak into a selected-group import.
        const nextSettings = {...this.original_game_settings_values.settings};
        const nextProfile = {...this.original_game_settings_values.profile};
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
            if (key in nextSettings && !report.settings.unknownKeys.includes(key)) {
              nextSettings[key] = value;
            }
          }
          for (const [key, value] of Object.entries(selectedSettings.profile)) {
            if (key in nextProfile && !report.profile.unknownKeys.includes(key)) {
              nextProfile[key] = value;
            }
          }
        }
        if (selection.importBindings && snapshot.gameSettings.bindings === undefined) {
          throw new Error('apex.configSnapshot.errors.invalidBindings');
        }
        const bindingMutations = selection.importBindings
          ? buildSnapshotBindingMutations(report.bindings, snapshot.gameSettings.bindings ?? [])
          : [];
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
          bindingMutations,
        };
      }

      const account = this.active_apex_account;
      const launchOptions = selection.importLaunchOptions && snapshot.launchOptions
        ? snapshot.launchOptions.raw
        : null;
      const result = await mutateApexConfig({request: {
        source: 'import',
        transactionId,
        launcher: launchOptions !== null && account ? toApexLauncherRef(account) : null,
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
      if (hasImportableVideoConfig) {
        const values = result.videoConfig
          ? normalizeVideoConfigMap(result.videoConfig)
          : {...this.video_config_values, ...videoUpdates};
        this.video_config_values = {...values};
        this.original_video_config = {...values};
        this.video_config_loaded = true;
        this.video_config_loaded_key = 'machine';
        this.video_config_load_status = 'ready';
        if (this.has_out_of_preset_selection) {
          const locked = await this.set_videoconfig_readonly(true);
          if (locked) toast.info('apex.outOfPresetAutoLocked');
        } else {
          await this.load_videoconfig_readonly();
        }
      }
      if (result.gameSettingsReport) {
        adoptApexGameSettingsReport(this, result.gameSettingsReport);
      }

      if (result.changedScopes.length === 0) {
        toast.info('apex.configSnapshot.noChanges');
        return false;
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
