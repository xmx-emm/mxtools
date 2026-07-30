import {useToast} from 'vue-toastification';
import {
  applyApexGameSettings,
  getApexGameSettings,
  restoreApexGameSettings,
} from '@/ipc/commands.ts';
import type {
  ApexBinding,
  ApexGameSettingsApplyRequest,
  ApexGameSettingsFile,
  ApexGameSettingsReport,
} from '@/types/apex_game_settings.ts';
import type {ApexStoreThis} from './types.ts';
import type {ApexConfigMutationMeta} from '@/types/apex_history.ts';
import {createApexHistoryTransactionId} from '@/utils/game/apex_history.ts';

export function adoptApexGameSettingsReport(
  store: ApexStoreThis,
  report: ApexGameSettingsReport,
) {
  store.game_settings_report = report;
  store.game_settings_values = {
    settings: {...report.settings.values},
    profile: {...report.profile.values},
  };
  store.original_game_settings_values = {
    settings: {...report.settings.values},
    profile: {...report.profile.values},
  };
  store.game_settings_bindings = report.bindings.map(binding => ({...binding}));
  store.original_game_settings_bindings = Object.fromEntries(
    report.bindings.map(binding => [binding.id, binding.input]),
  );
  store.game_settings_loaded = true;
  store.game_settings_loaded_key = 'machine';
  store.game_settings_load_status = 'ready';
  store.reset_pending_scopes = store.reset_pending_scopes.filter(
    scope => scope !== 'gameSettings',
  );
}

export function buildApexGameSettingsMutation(
  store: ApexStoreThis,
): Omit<ApexGameSettingsApplyRequest, 'historySource' | 'transactionId'> | null {
  const report = store.game_settings_report;
  if (!report) return null;
  const settingsUpdates = changedValues(
    store.game_settings_values.settings,
    store.original_game_settings_values.settings,
  );
  const profileUpdates = changedValues(
    store.game_settings_values.profile,
    store.original_game_settings_values.profile,
  );
  const bindingUpdates = store.game_settings_bindings
    .filter(binding => store.original_game_settings_bindings[binding.id] !== binding.input)
    .map(binding => ({id: binding.id, input: binding.input}));
  return {
    settingsRevision: report.settings.revision,
    profileRevision: report.profile.revision,
    settingsUpdates,
    profileUpdates,
    bindingUpdates,
  };
}

function changedValues(
  current: Record<string, string>,
  original: Record<string, string>,
): Record<string, string> {
  const updates: Record<string, string> = {};
  for (const [key, value] of Object.entries(current)) {
    if (original[key] !== value) updates[key] = value;
  }
  return updates;
}

export const apexSettingsActions = {
  async load_apex_game_settings(
    this: ApexStoreThis,
    options?: {silent?: boolean; force?: boolean},
  ) {
    if (this.is_game_settings_loading && !options?.force) return;
    const generation = ++this.game_settings_request_generation;
    this.is_game_settings_loading = true;
    this.game_settings_load_status = 'loading';
    this.game_settings_load_error = null;
    try {
      const report = await getApexGameSettings();
      if (generation !== this.game_settings_request_generation) return;
      adoptApexGameSettingsReport(this, report);
      this.game_settings_loaded_key = 'machine';
      this.game_settings_load_status = 'ready';
    } catch (error) {
      if (generation !== this.game_settings_request_generation) return;
      console.warn('load_apex_game_settings failed', error);
      this.game_settings_load_error = String(error);
      this.game_settings_load_status = 'error';
      if (!options?.silent) useToast().error(String(error));
    } finally {
      if (generation === this.game_settings_request_generation) {
        this.is_game_settings_loading = false;
      }
    }
  },

  start_game_settings(this: ApexStoreThis, force = false) {
    if (!force && this.reset_pending_scopes.includes('gameSettings')) return;
    if (!force && this.game_settings_loaded) {
      // Re-read clean cached settings when returning to the tab so external
      // Apex edits are reflected without overwriting local unapplied changes.
      if (!this.is_game_settings_modified && !this.is_game_settings_loading) {
        void this.load_apex_game_settings({silent: true, force: true});
      }
      return;
    }
    void this.load_apex_game_settings();
  },

  set_game_setting_value(
    this: ApexStoreThis,
    file: ApexGameSettingsFile,
    key: string,
    value: string,
  ) {
    this.game_settings_values[file][key] = value;
  },

  set_game_binding_input(this: ApexStoreThis, id: string, input: string) {
    const binding = this.game_settings_bindings.find(item => item.id === id);
    if (binding) binding.input = input;
  },

  async apply_apex_game_settings(
    this: ApexStoreThis,
    options?: {silent?: boolean} & ApexConfigMutationMeta,
  ): Promise<boolean> {
    const report = this.game_settings_report;
    if (!report || this.is_game_settings_saving) return false;
    const mutation = buildApexGameSettingsMutation(this);
    if (!mutation || (!Object.keys(mutation.settingsUpdates).length
      && !Object.keys(mutation.profileUpdates).length
      && !mutation.bindingUpdates.length)) {
      if (!options?.silent) useToast().info('apex.gameSettings.noChanges');
      return false;
    }

    this.is_game_settings_saving = true;
    try {
      const next = await applyApexGameSettings({
        ...mutation,
        historySource: options?.historySource ?? 'apply',
        transactionId: options?.transactionId ?? createApexHistoryTransactionId(),
      });
      adoptApexGameSettingsReport(this, next);
      if (!options?.silent) useToast().success('apex.gameSettings.applySuccess');
      return true;
    } catch (error) {
      console.warn('apply_apex_game_settings failed', error);
      if (!options?.silent) useToast().error(String(error), {timeout: 8000});
      return false;
    } finally {
      this.is_game_settings_saving = false;
    }
  },

  async restore_apex_game_settings(
    this: ApexStoreThis,
    restoreSettings: boolean,
    restoreProfile: boolean,
  ): Promise<boolean> {
    const report = this.game_settings_report;
    if (!report || this.is_game_settings_restoring) return false;
    this.is_game_settings_restoring = true;
    try {
      const next = await restoreApexGameSettings({
        settingsRevision: report.settings.revision,
        profileRevision: report.profile.revision,
        restoreSettings,
        restoreProfile,
      });
      adoptApexGameSettingsReport(this, next);
      useToast().success('apex.gameSettings.restoreSuccess');
      return true;
    } catch (error) {
      console.warn('restore_apex_game_settings failed', error);
      useToast().error(String(error), {timeout: 8000});
      return false;
    } finally {
      this.is_game_settings_restoring = false;
    }
  },

  replace_game_settings_bindings(this: ApexStoreThis, bindings: ApexBinding[]) {
    this.game_settings_bindings = bindings.map(binding => ({...binding}));
  },
};
