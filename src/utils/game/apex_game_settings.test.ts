import {describe, expect, it} from 'vitest';
import ApexGameSettingsData, {apexBindingCommandLabels} from '@/data/apex_game_settings.ts';
import {mdiPathByName} from '@/icons/mdi-icons.ts';
import type {ApexBinding} from '@/types/apex_game_settings.ts';
import {
  apexBindingFromKeyboardCode,
  apexBindingFromMouseButton,
  apexBindingFromWheelDelta,
  findApexBindingConflict,
  validateApexGameSettingsCatalog,
} from '@/utils/game/apex_game_settings.ts';

const binding = (id: string, input: string): ApexBinding => ({
  id,
  input,
  command: '+test',
  context: 0,
  heldCommand: null,
  editable: true,
  occurrence: 0,
});

describe('Apex game settings catalog', () => {
  it('has unique keys and complete controls', () => {
    expect(validateApexGameSettingsCatalog(ApexGameSettingsData)).toEqual([]);
  });

  it('keeps settings and profile keys distinct by file', () => {
    const keys = ApexGameSettingsData.map(field => `${field.file}:${field.key}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('includes only screenshot mappings whose stored values are confirmed', () => {
    expect(ApexGameSettingsData.find(field => field.id === 'tutorialSystem')).toMatchObject({
      file: 'profile', key: 'player_setting_tutorialization', section: 'gameplay',
    });
    expect(ApexGameSettingsData.find(field => field.id === 'arsenalMapIcons')).toMatchObject({
      file: 'profile', key: 'player_setting_arsenals_maphudidentifiers', section: 'hud',
    });
    expect(ApexGameSettingsData.find(field => field.id === 'shareUsageData')).toMatchObject({
      file: 'profile', key: 'pin_opt_in', section: 'privacy',
    });
    expect(ApexGameSettingsData.find(field => field.id === 'reticleColor')).toMatchObject({
      file: 'profile', key: 'reticle_color', section: 'gameplay', control: 'rgb',
    });
    expect(ApexGameSettingsData.find(field => field.id === 'reticleDamageFeedback')).toMatchObject({
      file: 'profile', key: 'damage_indicator_style_pilot', control: 'enum',
    });
    expect(ApexGameSettingsData.find(field => field.id === 'incomingDamageFeedback')?.options?.map(option => option.value)).toEqual([
      '0', '1', '2',
    ]);
    expect(ApexGameSettingsData.find(field => field.id === 'damageTextStyle')?.options?.map(option => option.value)).toEqual([
      '0', '1', '2', '3',
    ]);
    expect(ApexGameSettingsData.find(field => field.id === 'jetpackGlideControl')?.options).toEqual([
      expect.objectContaining({value: '0'}), expect.objectContaining({value: '1'}),
    ]);
    expect(ApexGameSettingsData.find(field => field.id === 'mantleBoostActivation')?.options?.map(option => option.value)).toEqual([
      '0', '1', '2', '3',
    ]);
    expect(ApexGameSettingsData.find(field => field.id === 'mantleBoostUi')?.options?.map(option => option.value)).toEqual([
      '0', '1', '2', '3',
    ]);
    expect(ApexGameSettingsData.find(field => field.id === 'healthAmmoPopup')?.options?.map(option => option.value)).toEqual([
      '0', '1', '2',
    ]);
    expect(ApexGameSettingsData.find(field => field.id === 'healthAmmoVoice')?.options).toEqual([
      expect.objectContaining({value: '0'}), expect.objectContaining({value: '1'}),
      expect.objectContaining({value: '2'}),
    ]);
    expect(ApexGameSettingsData.find(field => field.id === 'autoMuteCommunications')?.options).toEqual([
      expect.objectContaining({value: '1'}), expect.objectContaining({value: '0'}),
      expect.objectContaining({value: '-1'}),
    ]);
    expect(ApexGameSettingsData.find(field => field.id === 'mouseAdsMultiplier')).toMatchObject({
      key: 'mouse_ads_multiplier',
      readKey: 'mouse_zoomed_sensitivity_scalar_0',
      writeKeys: Array.from({length: 8}, (_, index) => `mouse_zoomed_sensitivity_scalar_${index}`),
      disabledWhen: {file: 'settings', key: 'mouse_use_per_scope_sensitivity_scalars', value: '1'},
    });
    expect(ApexGameSettingsData.find(field => field.id === 'mouseScope0')).toMatchObject({
      disabledWhen: {file: 'settings', key: 'mouse_use_per_scope_sensitivity_scalars', value: '0'},
    });
    expect(ApexGameSettingsData.find(field => field.id === 'controllerButtonLayout')?.options?.map(option => option.value)).toEqual([
      '0', '1', '2', '3', '4', '5', '6',
    ]);
    expect(ApexGameSettingsData.find(field => field.id === 'controllerMoveDeadzone')?.options?.map(option => option.value)).toEqual([
      '1', '2',
    ]);
    expect(ApexGameSettingsData.find(field => field.id === 'controllerTriggerThreshold')?.options?.map(option => option.value)).toEqual([
      '0', '30', '64', '128', '255',
    ]);
    expect(ApexGameSettingsData.find(field => field.id === 'controllerVibration')?.options?.map(option => option.value)).toEqual([
      '0', '1', '2',
    ]);
    expect(ApexGameSettingsData.find(field => field.id === 'ps5AdaptiveTriggers')).toMatchObject({
      file: 'profile', key: 'ps5_trig_enable', control: 'toggle',
    });
    expect(ApexGameSettingsData.find(field => field.id === 'autoMuteCommunications')?.options?.map(option => option.value)).toEqual([
      '1', '0', '-1',
    ]);
    expect(ApexGameSettingsData.find(field => field.id === 'voiceChatRecordMode')?.options?.map(option => option.value)).toEqual([
      '0', '1', '2',
    ]);
    expect(ApexGameSettingsData.find(field => field.id === 'voiceActivationThreshold')).toMatchObject({
      file: 'profile', key: 'voice_quiet_threshold', min: 0, max: 32767, step: 1,
    });
    expect(ApexGameSettingsData.find(field => field.id === 'audioOutputConfiguration')).toMatchObject({
      file: 'settings', key: 'miles_channels', control: 'enum',
      options: [
        {
          value: '0',
          labelKey: 'apexGameSettings.options.deviceDefault',
          descriptionKey: 'apexGameSettings.fields.audioOutputConfiguration.options.deviceDefault',
        },
        {
          value: '1',
          labelKey: 'apexGameSettings.options.mono',
          descriptionKey: 'apexGameSettings.fields.audioOutputConfiguration.options.mono',
        },
        {
          value: '2',
          labelKey: 'apexGameSettings.options.stereo',
          descriptionKey: 'apexGameSettings.fields.audioOutputConfiguration.options.stereo',
        },
      ],
    });
    expect(ApexGameSettingsData.find(field => field.id === 'pingOpacity')?.options?.map(option => option.value)).toEqual([
      '0.500000', '1.000000',
    ]);

    const keys = ApexGameSettingsData.map(field => field.key);
    expect(keys).not.toContain('gamepad_aim_speed_ads_0');
    expect(keys).not.toContain('sound_num_speakers');
    expect(keys).not.toContain('hud_setting_showMeter');
  });
});

describe('Apex binding conflict checks', () => {
  const bindings = [binding('one', 'w'), binding('two', 'MOUSE1')];

  it('rejects a key already used by another binding, case-insensitively', () => {
    expect(findApexBindingConflict(bindings, 'one', 'MOUSE1')?.id).toBe('two');
  });

  it('allows a binding to keep its current key', () => {
    expect(findApexBindingConflict(bindings, 'one', 'W')).toBeUndefined();
  });
});

describe('Apex runtime binding labels', () => {
  it('labels the non-obvious commands confirmed by before/after reset snapshots', () => {
    expect(apexBindingCommandLabels).toMatchObject({
      '+dodge': 'movementAbility',
      '+scriptCommand3': 'toggleFireMode',
      '+scriptcommand3': 'toggleFireMode',
      '+scriptCommand4': 'useSelectedMedical',
      '+scriptCommand5': 'characterUtility',
      '+scriptCommand6': 'survivalItem',
    });
  });
});

describe('Apex binding input capture', () => {
  it('maps keyboard codes to the config key names Apex accepts', () => {
    expect(apexBindingFromKeyboardCode('KeyW')).toBe('w');
    expect(apexBindingFromKeyboardCode('ShiftRight')).toBe('RSHIFT');
    expect(apexBindingFromKeyboardCode('Numpad7')).toBe('KP_HOME');
  });

  it('maps mouse buttons and wheel direction', () => {
    expect(apexBindingFromMouseButton(0)).toBe('MOUSE1');
    expect(apexBindingFromMouseButton(2)).toBe('MOUSE2');
    expect(apexBindingFromMouseButton(3)).toBe('MOUSE4');
    expect(apexBindingFromWheelDelta(-1)).toBe('MWHEELUP');
    expect(apexBindingFromWheelDelta(1)).toBe('MWHEELDOWN');
  });
});

describe('Apex action icons', () => {
  it('keeps the game-settings bottom actions resolvable', () => {
    expect(mdiPathByName['mdi-history']).toBeTruthy();
    expect(mdiPathByName['mdi-restore-alert']).toBeTruthy();
  });
});
