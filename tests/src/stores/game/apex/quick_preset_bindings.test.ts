import {beforeEach, describe, expect, it} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import {useApexStore} from '@/stores/game/apex/index.ts';
import {buildDefaultGameSettingOptions} from '@/data/presets/apex_quick_preset.ts';
import {buildApexGameSettingsMutation} from '@/stores/game/apex/actions_settings.ts';
import type {ApexBinding} from '@/types/apex_game_settings.ts';

const screen = {width: 1920, height: 1080, aspectRatio: 16 / 9, maxRefreshRate: 144};
const selection = {
  fpsCap: 144,
  aspectValue: 16 / 9,
  lockAxis: 'width' as const,
  enableResolutionPreset: false,
  enableGraphicsPreset: false,
  graphicsPresetId: 'competitive',
  enableSimplifiedReticle: false,
  launchOptions: {},
  videoOptions: {},
  gameSettingOptions: buildDefaultGameSettingOptions(),
};

function binding(id: string, input: string, command: string, context = 0): ApexBinding {
  return {id, input, command, context, heldCommand: null, editable: true, occurrence: 0};
}

beforeEach(() => setActivePinia(createPinia()));

describe('Apex quick preset binding replacement', () => {
  it('preserves toggle aim on right click and replaces occupied wheel inputs', () => {
    const apex = useApexStore();
    const original = [
      binding('toggle', 'MOUSE2', '+toggle_zoom'),
      binding('cycle-up', 'MWHEELUP', 'weaponSelectPrimary0'),
      binding('cycle-down', 'MWHEELDOWN', '+weaponCycle', 1),
      binding('forward', 'w', '+forward'),
      binding('jump', 'SPACE', '+jump'),
    ];
    apex.game_settings_bindings = original.map(item => ({...item}));
    apex.original_game_settings_bindings = Object.fromEntries(
      original.map(item => [item.id, item.input]),
    );
    apex.game_settings_report = {
      settings: {
        path: 'settings.cfg', revision: 'settings-1', values: {},
        unknownKeys: [], backupAvailable: false,
      },
      profile: {
        path: 'profile.cfg', revision: 'profile-1', values: {},
        unknownKeys: [], backupAvailable: false,
      },
      bindings: original,
    };

    apex.prepare_quick_preset(screen, selection);
    apex.prepare_quick_preset(screen, selection);

    const active = apex.game_settings_bindings.filter(item => item.input);
    expect(active.filter(item => ['weaponSelectPrimary0', '+weaponCycle']
      .includes(item.command))).toHaveLength(0);
    expect(active.filter(item => item.command === '+toggle_zoom').map(item => item.input))
      .toEqual(['MOUSE2']);
    expect(active.filter(item => item.command === '+forward').map(item => item.input))
      .toEqual(['w', 'MWHEELUP']);
    expect(active.filter(item => item.command === '+jump').map(item => item.input))
      .toEqual(['SPACE', 'MWHEELDOWN']);

    const mutation = buildApexGameSettingsMutation(apex);
    expect(mutation?.bindingMutations).toEqual(expect.arrayContaining([
      {operation: 'delete', id: 'cycle-up'},
      {operation: 'delete', id: 'cycle-down'},
      {operation: 'create', templateId: 'forward', input: 'MWHEELUP', context: 1},
      {operation: 'create', templateId: 'jump', input: 'MWHEELDOWN', context: 1},
    ]));
    expect(mutation?.bindingMutations).not.toContainEqual({operation: 'delete', id: 'toggle'});
  });

  it('replaces a non-aim right-click binding with the available hold-aim command', () => {
    const apex = useApexStore();
    const original = [
      binding('attack', 'MOUSE2', '+attack'),
      binding('zoom', '\\', '+zoom'),
      binding('forward', 'w', '+forward'),
      binding('jump', 'SPACE', '+jump'),
    ];
    apex.game_settings_bindings = original.map(item => ({...item}));
    apex.original_game_settings_bindings = Object.fromEntries(
      original.map(item => [item.id, item.input]),
    );
    apex.game_settings_report = {
      settings: {
        path: 'settings.cfg', revision: 'settings-1', values: {},
        unknownKeys: [], backupAvailable: false,
      },
      profile: {
        path: 'profile.cfg', revision: 'profile-1', values: {},
        unknownKeys: [], backupAvailable: false,
      },
      bindings: original,
    };

    apex.prepare_quick_preset(screen, selection);

    const mutation = buildApexGameSettingsMutation(apex);
    expect(mutation?.bindingMutations).toEqual(expect.arrayContaining([
      {operation: 'delete', id: 'attack'},
      {operation: 'create', templateId: 'zoom', input: 'MOUSE2', context: 1},
      {operation: 'create', templateId: 'forward', input: 'MWHEELUP', context: 1},
      {operation: 'create', templateId: 'jump', input: 'MWHEELDOWN', context: 1},
    ]));
    expect(apex.game_settings_bindings.filter(item => item.command === '+zoom').map(item => item.input))
      .toEqual(['\\', 'MOUSE2']);
  });

  it('reports a missing required action instead of silently skipping all bindings', () => {
    const apex = useApexStore();
    apex.game_settings_bindings = [
      binding('toggle', 'MOUSE2', '+toggle_zoom'),
      binding('jump', 'SPACE', '+jump'),
    ];

    expect(() => apex.prepare_quick_preset(screen, selection))
      .toThrow('apex.gameSettings.errors.bindingMissing: +forward');
  });
});
