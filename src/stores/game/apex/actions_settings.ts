import {useToast} from 'vue-toastification';
import {
  applyApexGameSettings,
  getApexGameSettings,
  restoreApexGameSettings,
} from '@/ipc/commands.ts';
import type {
  ApexBinding,
  ApexGameSettingsFile,
  ApexGameSettingsReport,
} from '@/types/apex_game_settings.ts';
import type {ApexStoreThis} from './types.ts';

function adoptReport(store: ApexStoreThis, report: ApexGameSettingsReport) {
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
  async load_apex_game_settings(this: ApexStoreThis) {
    if (this.is_game_settings_loading) return;
    this.is_game_settings_loading = true;
    try {
      adoptReport(this, await getApexGameSettings());
    } catch (error) {
      console.warn('load_apex_game_settings failed', error);
      useToast().error(String(error));
    } finally {
      this.is_game_settings_loading = false;
    }
  },

  start_game_settings(this: ApexStoreThis, force = false) {
    if (!force && this.game_settings_loaded) return;
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
    options?: {silent?: boolean},
  ): Promise<boolean> {
    const report = this.game_settings_report;
    if (!report || this.is_game_settings_saving) return false;
    const settingsUpdates = changedValues(
      this.game_settings_values.settings,
      this.original_game_settings_values.settings,
    );
    const profileUpdates = changedValues(
      this.game_settings_values.profile,
      this.original_game_settings_values.profile,
    );
    const bindingUpdates = this.game_settings_bindings
      .filter(binding => this.original_game_settings_bindings[binding.id] !== binding.input)
      .map(binding => ({id: binding.id, input: binding.input}));
    if (!Object.keys(settingsUpdates).length
      && !Object.keys(profileUpdates).length
      && !bindingUpdates.length) {
      if (!options?.silent) useToast().info('apex.gameSettings.noChanges');
      return false;
    }

    this.is_game_settings_saving = true;
    try {
      const next = await applyApexGameSettings({
        settingsRevision: report.settings.revision,
        profileRevision: report.profile.revision,
        settingsUpdates,
        profileUpdates,
        bindingUpdates,
      });
      adoptReport(this, next);
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
      adoptReport(this, next);
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
