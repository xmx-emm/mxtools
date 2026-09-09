import {beforeEach, describe, expect, it} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import fields, {apexGameSettingsReviewIgnoredKeys} from '@/data/apex_game_settings.ts';
import {buildApexGameSettingsMutation, adoptApexGameSettingsReport} from '@/stores/game/apex/actions_settings.ts';
import {isValidApexGameSettingValue, matchingApexGameSettingOptionValue} from '@/utils/game/apex_game_settings.ts';
import {presetStore} from './quick_preset_test_helpers.ts';

describe('Apex audio and accessible-chat menu choices', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('keeps the consumed PS5 initialization flag outside editable menu ownership', () => {
    expect(apexGameSettingsReviewIgnoredKeys.has('profile:ps5_force_enable_adth')).toBe(true);
    expect(fields.some(field => [field.key, field.readKey, ...(field.writeKeys ?? [])]
      .includes('ps5_force_enable_adth'))).toBe(false);
  });

  it.each([
    ['weaponDialogue', 'dialogue_cat_weapon_flavor', 'audio', ['0', '1']],
    ['accessibleChat', 'hud_setting_accessibleChat', 'accessibility', ['0', '1', '2', '3']],
  ] as const)('%s supports every declared menu choice without changing adjacent settings', (id, key, section, choices) => {
    const field = fields.find(field => field.id === id)!;
    expect(field).toMatchObject({file: 'profile', key, section});
    expect(apexGameSettingsReviewIgnoredKeys.has(`profile:${key}`)).toBe(false);
    expect(field.options?.map(option => option.value)).toEqual(choices);
    const untouched = {dialogue_cat_legend_flavor: '1', ps5_force_enable_adth: '1', cl_fovScale: '1.5'};
    const store = presetStore({...untouched, [key]: choices[choices.length - 1]});
    for (const value of choices) {
      expect(isValidApexGameSettingValue(fields, 'profile', key, value)).toBe(true);
      store.set_game_setting_value('profile', key, value);
      expect(buildApexGameSettingsMutation(store)).toMatchObject({
        profileUpdates: {[key]: value}, settingsUpdates: {}, bindingMutations: [],
      });
      const readback = {...store.game_settings_report!, profile: {...store.game_settings_report!.profile,
        values: {...untouched, [key]: value}}};
      setActivePinia(createPinia());
      const reopened = presetStore({});
      adoptApexGameSettingsReport(reopened, readback);
      expect(matchingApexGameSettingOptionValue(field, reopened.game_settings_values.profile[key])).toBe(value);
      expect(reopened.game_settings_values.profile).toEqual({...untouched, [key]: value});
      adoptApexGameSettingsReport(store, readback);
    }
    for (const value of ['-1', '4', '0.5', 'NaN', '1\n0']) {
      expect(isValidApexGameSettingValue(fields, 'profile', key, value)).toBe(false);
    }
  });
});
