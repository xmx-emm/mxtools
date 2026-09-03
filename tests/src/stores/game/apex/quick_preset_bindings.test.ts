import {beforeEach, describe, expect, it} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import {useApexStore} from '@/stores/game/apex/index.ts';
import {
  buildDefaultGameSettingOptions,
  QUICK_PRESET_AIM_MOUSE_RIGHT_KEY,
  QUICK_PRESET_FORWARD_WHEEL_UP_KEY,
  QUICK_PRESET_JUMP_WHEEL_DOWN_KEY,
} from '@/data/presets/apex_quick_preset.ts';
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
      {operation: 'delete', id: 'toggle'},
      {operation: 'delete', id: 'cycle-up'},
      {operation: 'delete', id: 'cycle-down'},
      {operation: 'create', templateId: 'toggle', input: 'MOUSE2', context: 0},
      {operation: 'create', templateId: 'forward', input: 'MWHEELUP', context: 1},
      {operation: 'create', templateId: 'jump', input: 'MWHEELDOWN', context: 1},
    ]));
    const firstCreate = mutation?.bindingMutations.findIndex(item => item.operation === 'create') ?? -1;
    const lastDelete = mutation?.bindingMutations.reduce(
      (last, item, index) => item.operation === 'delete' ? index : last,
      -1,
    ) ?? -1;
    expect(lastDelete).toBeLessThan(firstCreate);
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

  it('creates a missing action directly when an existing settings file has no template', () => {
    const apex = useApexStore();
    const original = [
      binding('toggle', 'MOUSE2', '+toggle_zoom'),
      binding('jump', 'SPACE', '+jump'),
      binding('attack', 'MOUSE1', '+attack'),
    ];
    apex.game_settings_bindings = original.map(item => ({...item}));
    apex.original_game_settings_bindings = Object.fromEntries(
      original.map(item => [item.id, item.input]),
    );
    apex.game_settings_report = {
      settings: {
        path: 'settings.cfg', revision: 'settings-1', exists: true, values: {},
        unknownKeys: [], backupAvailable: false,
      },
      profile: {
        path: 'profile.cfg', revision: 'profile-1', exists: true, values: {},
        unknownKeys: [], backupAvailable: false,
      },
      bindings: original,
    };

    apex.prepare_quick_preset(screen, selection);

    expect(buildApexGameSettingsMutation(apex)?.bindingMutations).toContainEqual({
      operation: 'createCommand', command: '+forward', input: 'MWHEELUP', context: 1,
    });
  });

  // settings.cfg 缺失/不完整时不再阻塞:后端会从内置默认模板初始化完整键位再应用
  it('prepares binding optimization when settings.cfg is missing (defaults are generated on apply)', () => {
    const apex = useApexStore();
    apex.game_settings_report = {
      settings: {
        path: 'settings.cfg', revision: 'empty', exists: false, values: {},
        unknownKeys: [], backupAvailable: true,
      },
      profile: {
        path: 'profile.cfg', revision: 'empty', exists: false, values: {},
        unknownKeys: [], backupAvailable: true,
      },
      bindings: [],
    };

    expect(() => apex.prepare_quick_preset(screen, selection)).not.toThrow();
  });

  it('prepares binding optimization for the legacy three-binding file (defaults are generated on apply)', () => {
    const apex = useApexStore();
    const incomplete = [
      binding('zoom', 'MOUSE2', '+zoom'),
      binding('forward', 'MWHEELUP', '+forward', 1),
      binding('jump', 'MWHEELDOWN', '+jump', 1),
    ];
    apex.game_settings_bindings = incomplete.map(item => ({...item}));
    apex.original_game_settings_bindings = Object.fromEntries(
      incomplete.map(item => [item.id, item.input]),
    );
    apex.game_settings_report = {
      settings: {
        path: 'settings.cfg', revision: 'incomplete', exists: true, values: {},
        unknownKeys: [], backupAvailable: false,
      },
      profile: {
        path: 'profile.cfg', revision: 'empty', exists: false, values: {},
        unknownKeys: [], backupAvailable: false,
      },
      bindings: incomplete,
    };

    expect(() => apex.prepare_quick_preset(screen, selection)).not.toThrow();
  });

  it('applies each binding optimization independently', () => {
    const apex = useApexStore();
    const original = [
      binding('attack', 'MOUSE2', '+attack'),
      binding('cycle-up', 'MWHEELUP', '+weaponCycle'),
      binding('cycle-down', 'MWHEELDOWN', '+weaponCycle', 1),
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
    const gameSettingOptions = {
      ...buildDefaultGameSettingOptions(),
      [QUICK_PRESET_AIM_MOUSE_RIGHT_KEY]: false,
      [QUICK_PRESET_FORWARD_WHEEL_UP_KEY]: true,
      [QUICK_PRESET_JUMP_WHEEL_DOWN_KEY]: false,
    };

    apex.prepare_quick_preset(screen, {...selection, gameSettingOptions});

    expect(apex.game_settings_bindings.find(item => item.id === 'attack')?.input).toBe('MOUSE2');
    expect(apex.game_settings_bindings.find(item => item.id === 'cycle-down')?.input)
      .toBe('MWHEELDOWN');
    expect(apex.game_settings_bindings.some(item => (
      item.input === 'MWHEELUP' && item.command === '+forward' && item.context === 1
    ))).toBe(true);
  });

  it('keeps unrelated duplicate action contexts from the default template', () => {
    const apex = useApexStore();
    const original = [
      binding('toggle', 'MOUSE2', '+toggle_zoom'),
      binding('forward', 'w', '+forward'),
      binding('forward-stale', 'MOUSE3', '+forward', 1),
      binding('forward-draft', 'MWHEELUP', '+forward', 1),
      binding('jump', 'SPACE', '+jump'),
      binding('jump-stale', 'MOUSE4', '+jump', 1),
      binding('jump-draft', 'MWHEELDOWN', '+jump', 1),
      binding('menu-escape', 'ESCAPE', 'ingamemenu_activate', 0),
      binding('menu-start', 'START', 'ingamemenu_activate', 0),
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

    const active = apex.game_settings_bindings.filter(item => item.input);
    expect(active.filter(item => item.command === '+toggle_zoom' && item.context === 0)).toHaveLength(1);
    expect(active.filter(item => item.command === '+forward' && item.context === 1)).toHaveLength(1);
    expect(active.filter(item => item.command === '+jump' && item.context === 1)).toHaveLength(1);
    expect(active.filter(item => item.command === 'ingamemenu_activate' && item.context === 0))
      .toHaveLength(2);

    const mutation = buildApexGameSettingsMutation(apex);
    expect(mutation?.bindingMutations).not.toContainEqual({operation: 'delete', id: 'menu-start'});
  });
});
