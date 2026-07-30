import {describe, expect, it} from 'vitest';
import {APEX_CONFIG_SNAPSHOT_VERSION} from '@/types/apex_config_snapshot.ts';
import {
  buildApexConfigSnapshot,
  buildVideoConfigPreviewItems,
  collectSelectedVideoUpdates,
  parseApexConfigSnapshot,
  splitApexGameSettingsSnapshot,
  stringifyApexConfigSnapshot,
  truncateLaunchOptionsPreview,
} from '@/utils/game/apex_config_snapshot.ts';

describe('buildApexConfigSnapshot', () => {
  it('omits unselected blocks', () => {
    const snap = buildApexConfigSnapshot({
      selection: {launchOptions: true, videoConfig: false},
      launchOptionsRaw: '+fps_max 144',
      videoConfig: {'setting.fullscreen': '1'},
      exportedAt: '2026-07-14T00:00:00.000Z',
    });
    expect(snap.launchOptions).toEqual({raw: '+fps_max 144'});
    expect(snap.videoConfig).toBeUndefined();
    expect(snap.kind).toBe('apex-config-snapshot');
    expect(snap.version).toBe(APEX_CONFIG_SNAPSHOT_VERSION);
  });

  it('exports game settings and bindings as separate selectable blocks', () => {
    const snap = buildApexConfigSnapshot({
      selection: {launchOptions: false, videoConfig: false, gameSettings: true, bindings: true},
      gameSettings: {
        settings: {'gfx_nvnUseLowLatency': '1'},
        profile: {'CrossPlay_user_optin': '1'},
        bindings: [{
          input: 'MOUSE1', command: '+attack', context: 0, heldCommand: null, occurrence: 0,
        }],
      },
    });
    expect(snap.gameSettings).toEqual({
      settings: {'gfx_nvnUseLowLatency': '1'},
      profile: {'CrossPlay_user_optin': '1'},
      bindings: [{
        input: 'MOUSE1', command: '+attack', context: 0, heldCommand: null, occurrence: 0,
      }],
    });
    expect(snap.launchOptions).toBeUndefined();
    expect(snap.videoConfig).toBeUndefined();
  });

  it('exports aiming and controller settings as distinct selections', () => {
    const values = {
      settings: {
        mouse_sensitivity: '1.2',
        gfx_nvnUseLowLatency: '1',
      },
      profile: {
        cl_fovScale: '1.7',
        gamepad_aim_speed: '4',
        gamepad_aim_speed_ads_3: '5',
      },
    };
    const aiming = buildApexConfigSnapshot({
      selection: {launchOptions: false, videoConfig: false, aiming: true},
      gameSettings: values,
    });
    const controller = buildApexConfigSnapshot({
      selection: {launchOptions: false, videoConfig: false, controller: true},
      gameSettings: values,
    });

    expect(aiming.gameSettings).toEqual({
      settings: {mouse_sensitivity: '1.2'},
      profile: {cl_fovScale: '1.7'},
    });
    expect(controller.gameSettings).toEqual({
      settings: {},
      profile: {gamepad_aim_speed: '4', gamepad_aim_speed_ads_3: '5'},
    });
  });

  it('throws when nothing selected', () => {
    expect(() =>
      buildApexConfigSnapshot({
        selection: {launchOptions: false, videoConfig: false},
      }),
    ).toThrow('apex.configSnapshot.errors.nothingSelected');
  });
});

describe('parseApexConfigSnapshot', () => {
  it('round-trips valid json', () => {
    const built = buildApexConfigSnapshot({
      selection: {launchOptions: true, videoConfig: true},
      launchOptionsRaw: '-fullscreen',
      videoConfig: {'setting.fullscreen': '1'},
      exportedAt: '2026-07-14T00:00:00.000Z',
    });
    const text = stringifyApexConfigSnapshot(built);
    const parsed = parseApexConfigSnapshot(text);
    expect(parsed).toEqual(built);
  });

  it('rejects bad kind', () => {
    expect(() =>
      parseApexConfigSnapshot(JSON.stringify({
        version: 1,
        kind: 'other',
        exportedAt: 'x',
        launchOptions: {raw: ''},
      })),
    ).toThrow('apex.configSnapshot.errors.unknownKind');
  });

  it('rejects version 2 snapshots', () => {
    expect(() =>
      parseApexConfigSnapshot(JSON.stringify({
        version: 2,
        kind: 'apex-config-snapshot',
        exportedAt: '2026-07-14T00:00:00.000Z',
        launchOptions: {raw: ''},
      })),
    ).toThrow('apex.configSnapshot.errors.unsupportedVersion');
  });

  it('rejects invalid json', () => {
    expect(() => parseApexConfigSnapshot('{')).toThrow(
      'apex.configSnapshot.errors.invalidJson',
    );
  });

  it('accepts snapshots without game settings', () => {
    const parsed = parseApexConfigSnapshot(JSON.stringify({
      version: 1,
      kind: 'apex-config-snapshot',
      exportedAt: '2026-07-14T00:00:00.000Z',
      launchOptions: {raw: '-fullscreen'},
    }));
    expect(parsed.version).toBe(1);
    expect(parsed.launchOptions?.raw).toBe('-fullscreen');
    expect(parsed.gameSettings).toBeUndefined();
  });

  it('rejects malformed game settings and binding blocks', () => {
    const base = {
      version: 1,
      kind: 'apex-config-snapshot',
      exportedAt: '2026-07-14T00:00:00.000Z',
      launchOptions: {raw: ''},
    };
    expect(() => parseApexConfigSnapshot(JSON.stringify({
      ...base,
      gameSettings: {settings: [], profile: {}},
    }))).toThrow('apex.configSnapshot.errors.invalidGameSettings');
    expect(() => parseApexConfigSnapshot(JSON.stringify({
      ...base,
      gameSettings: {
        settings: {}, profile: {}, bindings: [{input: 'w', command: '+forward'}],
      },
    }))).toThrow('apex.configSnapshot.errors.invalidBindings');
  });

  it('rejects non-integer binding identity fields', () => {
    expect(() => parseApexConfigSnapshot(JSON.stringify({
      version: 1,
      kind: 'apex-config-snapshot',
      exportedAt: '2026-07-14T00:00:00.000Z',
      gameSettings: {
        settings: {},
        profile: {},
        bindings: [{input: 'w', command: '+forward', context: 0.5, occurrence: 0}],
      },
    }))).toThrow('apex.configSnapshot.errors.invalidBindings');
  });
});

describe('splitApexGameSettingsSnapshot', () => {
  it('classifies legacy snapshot values for separate import controls', () => {
    const groups = splitApexGameSettingsSnapshot({
      settings: {mouse_sensitivity: '1.2', custom_unknown: 'x'},
      profile: {
        gamepad_aim_speed: '4',
        gamepad_ads_advanced_sensitivity_scalar_3: '1.25',
        CrossPlay_user_optin: '1',
      },
    });
    expect(groups.aiming.settings).toEqual({mouse_sensitivity: '1.2'});
    expect(groups.controller.profile).toEqual({
      gamepad_aim_speed: '4',
      gamepad_ads_advanced_sensitivity_scalar_3: '1.25',
    });
    expect(groups.gameSettings).toEqual({
      settings: {custom_unknown: 'x'},
      profile: {CrossPlay_user_optin: '1'},
    });
  });
});

describe('buildVideoConfigPreviewItems', () => {
  it('groups known keys and leaves unknown as raw', () => {
    const items = buildVideoConfigPreviewItems({
      'setting.fullscreen': '1',
      'setting.nowindowborder': '1',
      'setting.unknown_custom': '9',
    });
    const windowMode = items.find((i) => i.id === 'group.windowMode');
    expect(windowMode).toBeTruthy();
    expect(windowMode!.keys).toEqual(
      expect.arrayContaining(['setting.fullscreen', 'setting.nowindowborder']),
    );
    const raw = items.find((i) => i.id === 'raw:setting.unknown_custom');
    expect(raw?.keys).toEqual(['setting.unknown_custom']);
  });
});

describe('collectSelectedVideoUpdates', () => {
  it('only includes selected item keys', () => {
    const video = {
      'setting.fullscreen': '1',
      'setting.nowindowborder': '1',
      'setting.unknown_custom': '9',
    };
    const items = buildVideoConfigPreviewItems(video);
    const updates = collectSelectedVideoUpdates(video, items, [
      'raw:setting.unknown_custom',
    ]);
    expect(updates).toEqual({'setting.unknown_custom': '9'});
  });
});

describe('truncateLaunchOptionsPreview', () => {
  it('truncates long strings', () => {
    const long = 'a'.repeat(200);
    expect(truncateLaunchOptionsPreview(long, 10)).toBe(`${'a'.repeat(10)}…`);
  });
});
