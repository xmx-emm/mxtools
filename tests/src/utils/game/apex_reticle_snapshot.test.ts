import {describe, expect, it} from 'vitest';
import values from '../../../fixtures/apex/reticle-values.json';
import ApexGameSettingsData from '@/data/apex_game_settings.ts';
import {isValidApexGameSettingValue} from '@/utils/game/apex_game_settings.ts';
import {buildApexConfigSnapshot, parseApexConfigSnapshot, stringifyApexConfigSnapshot} from '@/utils/game/apex_config_snapshot.ts';

describe('reticle snapshot round trip', () => {
  it.each(values.accepted)('exports and parses supported profile value %j', value => {
    expect(isValidApexGameSettingValue(ApexGameSettingsData, 'profile', 'reticle_color', value)).toBe(true);
    const exported = buildApexConfigSnapshot({selection: {launchOptions: false, videoConfig: false, gameSettings: true},
      gameSettings: {settings: {}, profile: {reticle_color: value}}});
    expect(parseApexConfigSnapshot(stringifyApexConfigSnapshot(exported)).gameSettings?.profile.reticle_color).toBe(value);
  });
  it.each(values.rejected)('rejects unsupported or injected profile value %j', value => {
    expect(isValidApexGameSettingValue(ApexGameSettingsData, 'profile', 'reticle_color', value)).toBe(false);
    expect(() => parseApexConfigSnapshot(JSON.stringify({kind: 'apex-config-snapshot', version: 1,
      exportedAt: '', gameSettings: {settings: {}, profile: {reticle_color: value}}}))).toThrow();
  });
});
