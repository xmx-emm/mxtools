import {describe, expect, it} from 'vitest';
import ApexGameSettingsData from '@/data/apex_game_settings.ts';

describe('Apex audio settings catalog', () => {
  it('maps the runtime-verified voice chat record modes', () => {
    expect(ApexGameSettingsData.find(field => field.id === 'voiceChatRecordMode')?.options?.map(option => option.value)).toEqual([
      '0', '1', '2',
    ]);
  });

  it('keeps the observed open-mic threshold range and precision', () => {
    expect(ApexGameSettingsData.find(field => field.id === 'voiceActivationThreshold')).toMatchObject({
      file: 'profile', key: 'voice_quiet_threshold', min: 0, max: 32767, step: 1,
    });
  });

  it('maps each output configuration value to its stable label and description', () => {
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
  });
});
