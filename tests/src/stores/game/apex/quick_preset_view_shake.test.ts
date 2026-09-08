import {readFileSync} from 'node:fs';
import {beforeEach, describe, expect, it} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import {quickPresetGameSettingToggles} from '@/data/presets/apex_quick_preset.ts';
import {buildApexGameSettingsMutation} from '@/stores/game/apex/actions_settings.ts';
import {initGameSettingOptionsForDialog} from '@/utils/game/apex_quick_preset.ts';
import {gameOnlyPreset, presetStore, quickPresetScreen} from './quick_preset_test_helpers.ts';

beforeEach(() => setActivePinia(createPinia()));

describe('Apex quick preset minimal sprint view shake', () => {
  it('targets Minimal (1) without changing the game reset default Normal (0)', () => {
    expect(quickPresetGameSettingToggles.find(([id]) => id === 'viewShake')).toEqual([
      'viewShake', 'sprint_view_shake_style', '1', 'viewShakeLowest',
    ]);
    const resetProfile = readFileSync(new URL(
      '../../../../../src-tauri/src/game/apex_defaults/profile.cfg', import.meta.url,
    ), 'utf8');
    expect(resetProfile).toMatch(/^sprint_view_shake_style "0"\r?$/m);
  });

  it.each([
    ['0', false],
    ['1', true],
    ['', false],
  ])('checks the option for stored value %s only when it is Minimal', (value, selected) => {
    expect(initGameSettingOptionsForDialog({sprint_view_shake_style: value}, []).viewShake)
      .toBe(selected);
  });

  it('writes 1 when selected and detects the resulting optimized state', () => {
    const store = presetStore({sprint_view_shake_style: '0', fov_disableAbilityScaling: '0'});
    store.prepare_quick_preset(quickPresetScreen, gameOnlyPreset({viewShake: true}));

    expect(buildApexGameSettingsMutation(store)).toMatchObject({
      profileUpdates: {sprint_view_shake_style: '1'},
      settingsUpdates: {},
      bindingMutations: [],
    });
    expect(store.game_settings_values.profile.fov_disableAbilityScaling).toBe('0');
    expect(initGameSettingOptionsForDialog(store.game_settings_values.profile, []).viewShake).toBe(true);
  });

  it.each(['0', '1'])('leaves the stored value %s alone when unchecked', value => {
    const store = presetStore({sprint_view_shake_style: value});
    store.prepare_quick_preset(quickPresetScreen, gameOnlyPreset({viewShake: false}));

    expect(store.game_settings_values.profile.sprint_view_shake_style).toBe(value);
    expect(buildApexGameSettingsMutation(store)?.profileUpdates).toEqual({});
  });
});
