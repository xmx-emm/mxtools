import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {createI18n} from 'vue-i18n';
import {apexConfigMessages as zhCN} from '@/i18n/locales/zh-CN/apex-config.ts';
import {apexConfigMessages as enUS} from '@/i18n/locales/en-US/apex-config.ts';
import {getApexGameSettingsReviewEntries} from '@/utils/game/apex_game_settings_review.ts';

const reviewedDefaults = {
  cl_deathhints_enabled: '1', cl_safearea: '0',
  hud_setting_accolades_hudState: '0', hud_setting_accolades_tier_filter: '0',
  hud_setting_adsDof: '1', hud_setting_aind: '0', hud_setting_compactOverHeadNames: '0',
  hud_setting_pingDoubleTapEnemy: '1', hud_setting_showCallsigns: '1',
  hud_setting_showLevelUp: '1', hud_setting_showTeamNamesOnMap: '0',
  hud_setting_showWeaponFlyouts: '1', hudchat_visibility: '1', party_color_enabled: '0',
  rankedplay_display_enabled: '0', rankedplay_voice_enabled: '0',
  sound_musicReduced: '0', ziprail_roll_strength: '1',
};

function defaultValues(file: 'settings' | 'profile'): Record<string, string> {
  const raw = readFileSync(new URL(`../../../../src-tauri/src/game/apex_defaults/${file}.cfg`, import.meta.url), 'utf8');
  // Match only full key/value lines, excluding the default binding commands.
  return Object.fromEntries([...raw.matchAll(/^(\S+)\s+"([^"\r\n]*)"\s*$/gm)]
    .map(match => [match[1], match[2]]));
}

describe('Apex settings review evidence', () => {
  it('keeps every unowned template key visible with a specific note, including unresolved keys', () => {
    const values = {settings: defaultValues('settings'), profile: defaultValues('profile')};
    const entries = getApexGameSettingsReviewEntries(values);
    expect(entries.map(entry => `${entry.file}:${entry.key}`).sort()).toEqual(
      Object.keys(reviewedDefaults).map(key => `profile:${key}`).sort(),
    );
    expect(Object.fromEntries(entries.map(entry => [entry.key, entry.value]))).toEqual(reviewedDefaults);
    for (const entry of entries) {
      expect(entry.descriptionKey).not.toBe('apexGameSettings.unknownDescription');
    }
  });

  it('shows new keys and same-name keys in the other file without borrowing profile evidence', () => {
    const entries = getApexGameSettingsReviewEntries({
      settings: {cl_safearea: '0.5', future_setting: 'custom'},
      profile: {future_profile: '2', cl_safearea: '0.5', ps5_force_enable_adth: '1'},
    });
    expect(entries).toHaveLength(4);
    expect(entries.find(entry => entry.file === 'settings' && entry.key === 'cl_safearea')).toMatchObject({
      value: '0.5', descriptionKey: 'apexGameSettings.unknownDescription',
    });
    expect(entries.find(entry => entry.file === 'profile' && entry.key === 'cl_safearea')).toMatchObject({
      value: '0.5', descriptionKey: 'apexGameSettings.reviewNotes.safeArea',
    });
    expect(entries.filter(entry => entry.key.startsWith('future_'))).toEqual([
      expect.objectContaining({key: 'future_profile', descriptionKey: 'apexGameSettings.unknownDescription'}),
      expect.objectContaining({key: 'future_setting', descriptionKey: 'apexGameSettings.unknownDescription'}),
    ]);
  });

  it('excludes actual menu storage, companion flags and reviewed internal keys only in their own file', () => {
    const entries = getApexGameSettingsReviewEntries({
      settings: {mouse_zoomed_sensitivity_scalar_0: '1.1', ps5_force_enable_adth: '0'},
      profile: {hud_setting_accessibleChat: '3', dialogue_cat_weapon_flavor: '0',
        dialogue_cat_legend_important: '1', toggle_on_jump_to_deactivate_changed: '1',
        ps5_force_enable_adth: '1', hud_setting_showLevelUp: '2'},
    });
    expect(entries.map(entry => `${entry.file}:${entry.key}`)).toEqual([
      'profile:hud_setting_showLevelUp', 'settings:ps5_force_enable_adth',
    ]);
  });

  it.each(['zh-CN', 'en-US'] as const)('localizes all notes and searches their descriptions in %s', locale => {
    const {t, te} = createI18n({legacy: false, locale, messages: {'zh-CN': zhCN, 'en-US': enUS}}).global;
    const values = {settings: {}, profile: reviewedDefaults};
    for (const entry of getApexGameSettingsReviewEntries(values)) {
      expect(te(entry.descriptionKey)).toBe(true);
      expect(getApexGameSettingsReviewEntries(values, t(entry.descriptionKey), key => t(key)))
        .toContainEqual(entry);
    }
    expect(getApexGameSettingsReviewEntries(values, locale === 'zh-CN' ? '双击敌人标记' : 'ENEMY PING', key => t(key)))
      .toEqual([expect.objectContaining({key: 'hud_setting_pingDoubleTapEnemy'})]);
    expect(getApexGameSettingsReviewEntries(values, ' CL_SAFEAREA ', key => t(key)))
      .toEqual([expect.objectContaining({key: 'cl_safearea'})]);
  });
});
