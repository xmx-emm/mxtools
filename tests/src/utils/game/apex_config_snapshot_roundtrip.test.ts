import {describe, expect, it} from 'vitest';
import {
  buildApexConfigSnapshot,
  parseApexConfigSnapshot,
  stringifyApexConfigSnapshot,
} from '@/utils/game/apex_config_snapshot.ts';

describe('Apex config snapshot complete round-trip', () => {
  it('preserves every transferable block and strips machine-owned values', () => {
    const built = buildApexConfigSnapshot({
      selection: {
        launchOptions: true,
        videoConfig: true,
        gameSettings: true,
        aiming: true,
        controller: true,
        bindings: true,
      },
      exportedAt: '2026-08-31T00:00:00.000Z',
      launchOptionsRaw: '+fps_max 240 +miles_language english',
      videoConfig: {
        'setting.fullscreen': '1',
        'setting.configversion': '99',
      },
      gameSettings: {
        settings: {
          mouse_sensitivity: '1.2',
          gfx_nvnUseLowLatency: '1',
          miles_output_device: 'LOCAL_OUTPUT',
          voice_input_device: 'LOCAL_INPUT',
        },
        profile: {
          cl_fovScale: '1.7',
          laserSightColor: '16711680',
          gamepad_aim_speed: '4',
          CrossPlay_user_optin: '1',
        },
        bindings: [{
          input: 'MOUSE1',
          command: '+attack',
          context: 0,
          heldCommand: null,
          occurrence: 0,
        }],
      },
    });

    const parsed = parseApexConfigSnapshot(stringifyApexConfigSnapshot(built));
    expect(parsed).toEqual({
      version: 1,
      kind: 'apex-config-snapshot',
      exportedAt: '2026-08-31T00:00:00.000Z',
      launchOptions: {raw: '+fps_max 240 +miles_language english'},
      videoConfig: {'setting.fullscreen': '1'},
      gameSettings: {
        settings: {
          mouse_sensitivity: '1.2',
          gfx_nvnUseLowLatency: '1',
        },
        profile: {
          cl_fovScale: '1.7',
          laserSightColor: '16711680',
          gamepad_aim_speed: '4',
          CrossPlay_user_optin: '1',
        },
        bindings: [{
          input: 'MOUSE1', command: '+attack', context: 0,
          heldCommand: null, occurrence: 0,
        }],
      },
    });
  });

  it('rejects a selection that produces no transferable values', () => {
    expect(() => buildApexConfigSnapshot({
      selection: {launchOptions: false, videoConfig: true},
      videoConfig: {'setting.configversion': '1'},
    })).toThrow('apex.configSnapshot.errors.emptySnapshot');
  });

  it('rejects top-level arrays and primitive JSON values', () => {
    for (const value of ['[]', 'null', '"snapshot"', '42']) {
      expect(() => parseApexConfigSnapshot(value)).toThrow(
        'apex.configSnapshot.errors.invalidShape',
      );
    }
  });
});
