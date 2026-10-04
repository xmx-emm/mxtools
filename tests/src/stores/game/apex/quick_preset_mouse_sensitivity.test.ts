import {beforeEach, describe, expect, it} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import {useApexStore} from '@/stores/game/apex/index.ts';
import {adoptApexGameSettingsReport, buildApexGameSettingsMutation} from '@/stores/game/apex/actions_settings.ts';
import {gameOnlyPreset, quickPresetScreen} from './quick_preset_test_helpers.ts';

beforeEach(() => setActivePinia(createPinia()));

function presetStoreWithSensitivity(value = '1.2') {
  const store = useApexStore();
  store.video_config_values = {'setting.configversion': '10'};
  store.original_video_config = {'setting.configversion': '10'};
  adoptApexGameSettingsReport(store, {
    settings: {
      path: 'settings.cfg', revision: 'settings-1', exists: true,
      values: {mouse_sensitivity: value}, unknownKeys: [], backupAvailable: false,
    },
    profile: {
      path: 'profile.cfg', revision: 'profile-1', exists: true,
      values: {}, unknownKeys: [], backupAvailable: false,
    },
    bindings: [],
  });
  return store;
}

describe('Apex quick preset mouse sensitivity', () => {
  it('writes the selected value to settings.cfg', () => {
    const store = presetStoreWithSensitivity();

    store.prepare_quick_preset(quickPresetScreen, {
      ...gameOnlyPreset({}),
      mouseSensitivity: 1.75,
    });

    expect(store.game_settings_values.settings.mouse_sensitivity).toBe('1.75');
    expect(buildApexGameSettingsMutation(store)?.settingsUpdates).toEqual({
      mouse_sensitivity: '1.75',
    });
  });

  it('clamps values to the game setting range and leaves the setting unchanged when omitted', () => {
    const high = presetStoreWithSensitivity();
    high.prepare_quick_preset(quickPresetScreen, {
      ...gameOnlyPreset({}),
      mouseSensitivity: 99,
    });
    expect(high.game_settings_values.settings.mouse_sensitivity).toBe('20');

    const unchanged = presetStoreWithSensitivity('1.4');
    unchanged.prepare_quick_preset(quickPresetScreen, gameOnlyPreset({}));
    expect(unchanged.game_settings_values.settings.mouse_sensitivity).toBe('1.4');
    expect(buildApexGameSettingsMutation(unchanged)?.settingsUpdates).toEqual({});
  });
});
