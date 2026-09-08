import {beforeEach, describe, expect, it} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import {buildApexGameSettingsMutation} from '@/stores/game/apex/actions_settings.ts';
import {quickPresetGameSettingToggles} from '@/data/presets/apex_quick_preset.ts';
import {gameOnlyPreset, presetStore, quickPresetScreen} from './quick_preset_test_helpers.ts';

beforeEach(() => setActivePinia(createPinia()));

describe('Quick preset profile initialization', () => {
  it.each([true, false])('sends all selected optimizations for an empty profile (exists=%s)', exists => {
    const store = presetStore({});
    store.game_settings_report!.profile.exists = exists;
    store.prepare_quick_preset(quickPresetScreen, gameOnlyPreset(
      Object.fromEntries(quickPresetGameSettingToggles.map(([id]) => [id, true])),
    ));
    expect(buildApexGameSettingsMutation(store)?.profileUpdates).toEqual(
      Object.fromEntries(quickPresetGameSettingToggles.map(([, key, value]) => [key, value])),
    );
  });

  it.each(quickPresetGameSettingToggles)('can add missing %s without changing other values', (id, key, value) => {
    const existing = {cl_fovScale: '1.5', custom_key: 'keep'};
    const store = presetStore(existing);
    store.prepare_quick_preset(quickPresetScreen, gameOnlyPreset({[id]: true}));
    expect(buildApexGameSettingsMutation(store)?.profileUpdates).toEqual({[key]: value});
    expect(store.game_settings_values.profile).toEqual({...existing, [key]: value});
  });
});
