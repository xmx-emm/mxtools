import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import type {SteamUser} from '@/types/steam.ts';
import type {ApexConfigSnapshot} from '@/types/apex_config_snapshot.ts';
import type {ApexGameSettingsReport} from '@/types/apex_game_settings.ts';

const mocks = vi.hoisted(() => ({
  getApexLaunchOption: vi.fn(),
  getApexVideoConfig: vi.fn(),
  getApexGameSettings: vi.fn(),
  mutateApexConfig: vi.fn(),
  setApexLaunchOption: vi.fn(),
  setApexLaunchOptionEa: vi.fn(),
  setApexVideoConfig: vi.fn(),
  apexIsRunning: vi.fn(),
  getApexVideoconfigReadonly: vi.fn(),
  emitApexConfigChanged: vi.fn(),
}));

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('@/ipc/commands.ts', async () => {
  const actual = await vi.importActual<typeof import('@/ipc/commands.ts')>('@/ipc/commands.ts');
  return {...actual, ...mocks};
});

vi.mock('@/utils/game/apex_config_events.ts', () => ({
  emitApexConfigChanged: mocks.emitApexConfigChanged,
}));

import {useApexStore} from '@/stores/game/apex/index.ts';
import {useSteamStore} from '@/stores/game/steam.ts';
import {
  adoptApexGameSettingsReport,
  buildApexGameSettingsMutation,
} from '@/stores/game/apex/actions_settings.ts';
import {buildDefaultGameSettingOptions} from '@/data/presets/apex_quick_preset.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return {promise, resolve};
}

function steamUser(id: string): SteamUser {
  return {id, name: `Steam ${id}`, avatar: '', config_path: `C:/steam/${id}/localconfig.vdf`};
}

function gameSettingsReport(value: string): ApexGameSettingsReport {
  return {
    settings: {
      path: 'settings.cfg',
      revision: `settings-${value}`,
      values: {mouse_sensitivity: value},
      unknownKeys: [],
      backupAvailable: false,
    },
    profile: {
      path: 'profile.cfg',
      revision: `profile-${value}`,
      values: {},
      unknownKeys: [],
      backupAvailable: false,
    },
    bindings: [],
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  mocks.apexIsRunning.mockResolvedValue(false);
  mocks.getApexVideoconfigReadonly.mockResolvedValue(false);
  mocks.emitApexConfigChanged.mockResolvedValue(undefined);
});

describe('Apex cached loading state machine', () => {
  it('discards an obsolete launch response after the account changes', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    mocks.getApexLaunchOption
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const steam = useSteamStore();
    const apex = useApexStore();
    const user1 = steamUser('1');
    const user2 = steamUser('2');
    steam.steam_users = [user1, user2];
    apex.set_active_apex_account({kind: 'steam', user: user1});

    const oldRequest = apex.load_launch_data();
    apex.set_active_apex_account({kind: 'steam', user: user2});
    const newRequest = apex.load_launch_data();
    second.resolve('+fps_max 222');
    await newRequest;
    first.resolve('+fps_max 111');
    await oldRequest;

    expect(apex.fps).toBe(222);
    expect(apex.launch_loaded_for_key).toBe('steam:2');
    expect(apex.launch_load_status).toBe('ready');
  });

  it('keeps the latest forced video refresh and reuses the cached tab data', async () => {
    const first = deferred<Record<string, string>>();
    const second = deferred<Record<string, string>>();
    mocks.getApexVideoConfig
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const apex = useApexStore();

    const oldRequest = apex.load_apex_video_config({force: true});
    const newRequest = apex.load_apex_video_config({force: true});
    second.resolve({'setting.fullscreen': '1'});
    await newRequest;
    first.resolve({'setting.fullscreen': '0'});
    await oldRequest;
    apex.start_video_config();

    expect(apex.video_config_values['setting.fullscreen']).toBe('1');
    expect(apex.video_config_load_status).toBe('ready');
    expect(mocks.getApexVideoConfig).toHaveBeenCalledTimes(2);
  });

  it('lets every caller await the same in-flight game settings read', async () => {
    const pending = deferred<ApexGameSettingsReport>();
    mocks.getApexGameSettings.mockReturnValueOnce(pending.promise);
    const apex = useApexStore();

    const first = apex.load_apex_game_settings();
    const second = apex.load_apex_game_settings();
    expect(mocks.getApexGameSettings).toHaveBeenCalledTimes(1);
    expect(apex.is_game_settings_loading).toBe(true);

    pending.resolve(gameSettingsReport('1'));
    await Promise.all([first, second]);
    expect(apex.game_settings_values.settings.mouse_sensitivity).toBe('1');
    expect(apex.game_settings_load_status).toBe('ready');
    expect(apex.is_game_settings_loading).toBe(false);
  });

  it('does not let a stale silent refresh overwrite a newer local edit', async () => {
    const pending = deferred<ApexGameSettingsReport>();
    mocks.getApexGameSettings.mockReturnValueOnce(pending.promise);
    const apex = useApexStore();
    adoptApexGameSettingsReport(apex, gameSettingsReport('1'));

    const refresh = apex.load_apex_game_settings({silent: true, force: true});
    apex.set_game_setting_value('settings', 'mouse_sensitivity', '1.5');
    pending.resolve(gameSettingsReport('2'));
    await refresh;

    expect(apex.game_settings_values.settings.mouse_sensitivity).toBe('1.5');
    expect(apex.original_game_settings_values.settings.mouse_sensitivity).toBe('1');
    expect(apex.game_settings_load_status).toBe('ready');
    expect(apex.is_game_settings_loading).toBe(false);
  });

  it('returns to ready when a forced refresh preserves an existing draft', async () => {
    const pending = deferred<ApexGameSettingsReport>();
    mocks.getApexGameSettings.mockReturnValueOnce(pending.promise);
    const apex = useApexStore();
    adoptApexGameSettingsReport(apex, gameSettingsReport('1'));
    apex.set_game_setting_value('settings', 'mouse_sensitivity', '1.5');

    const refresh = apex.load_apex_game_settings({silent: true, force: true});
    pending.resolve(gameSettingsReport('2'));
    await refresh;

    expect(apex.game_settings_values.settings.mouse_sensitivity).toBe('1.5');
    expect(apex.original_game_settings_values.settings.mouse_sensitivity).toBe('1');
    expect(apex.game_settings_load_status).toBe('ready');
    expect(apex.is_game_settings_loading).toBe(false);
  });

  it('can explicitly replace a pre-existing draft after another window writes config', async () => {
    const pending = deferred<ApexGameSettingsReport>();
    mocks.getApexGameSettings.mockReturnValueOnce(pending.promise);
    const apex = useApexStore();
    adoptApexGameSettingsReport(apex, gameSettingsReport('1'));
    apex.set_game_setting_value('settings', 'mouse_sensitivity', '1.5');

    const refresh = apex.load_apex_game_settings({
      silent: true,
      force: true,
      discardLocal: true,
    });
    pending.resolve(gameSettingsReport('2'));
    await refresh;

    expect(apex.game_settings_values.settings.mouse_sensitivity).toBe('2');
    expect(apex.original_game_settings_values.settings.mouse_sensitivity).toBe('2');
    expect(apex.is_game_settings_modified).toBe(false);
  });
});

describe('Apex unified mutations', () => {
  it('applies a quick preset with one backend transaction', async () => {
    const steam = useSteamStore();
    const apex = useApexStore();
    const user = steamUser('1');
    steam.steam_users = [user];
    apex.set_active_apex_account({kind: 'steam', user});
    apex.launch_loaded_for_key = 'steam:1';
    apex.video_config_values = {'setting.fullscreen': '1'};
    apex.original_video_config = {'setting.fullscreen': '0'};
    apex.check_miles_language = vi.fn().mockResolvedValue(true);
    apex.set_videoconfig_readonly = vi.fn().mockResolvedValue(true);
    mocks.mutateApexConfig.mockResolvedValue({
      historyEntry: null,
      changedScopes: ['launch', 'video'],
      launchOptions: apex.launch_options,
      videoConfig: {'setting.fullscreen': '1'},
      gameSettingsReport: null,
    });

    expect(await apex.apply_quick_preset_persist()).toBe(true);
    expect(mocks.mutateApexConfig).toHaveBeenCalledTimes(1);
    expect(mocks.setApexLaunchOption).not.toHaveBeenCalled();
    expect(mocks.setApexVideoConfig).not.toHaveBeenCalled();
    expect(mocks.emitApexConfigChanged).toHaveBeenCalledWith([
      'launch',
      'video',
    ]);
  });

  it('imports selected launch options with one backend transaction', async () => {
    const steam = useSteamStore();
    const apex = useApexStore();
    const user = steamUser('1');
    steam.steam_users = [user];
    apex.set_active_apex_account({kind: 'steam', user});
    apex.check_miles_language = vi.fn().mockResolvedValue(true);
    const snapshot: ApexConfigSnapshot = {
      kind: 'apex-config-snapshot',
      version: 1,
      exportedAt: '2026-07-29T00:00:00Z',
      launchOptions: {raw: '+fps_max 240'},
    };
    mocks.mutateApexConfig.mockResolvedValue({
      historyEntry: null,
      changedScopes: ['launch'],
      launchOptions: '+fps_max 240',
      videoConfig: null,
      gameSettingsReport: null,
    });

    const applied = await apex.apply_config_snapshot(snapshot, {
      importLaunchOptions: true,
      importVideoConfig: false,
      videoSelectMode: 'all',
      selectedVideoItemIds: [],
    });
    expect(applied).toBe(true);
    expect(mocks.mutateApexConfig).toHaveBeenCalledTimes(1);
    expect(mocks.setApexLaunchOption).not.toHaveBeenCalled();
  });
});

describe('Apex binding slot drafts', () => {
  it('builds independent create and delete mutations for the two UI slots', () => {
    const apex = useApexStore();
    apex.game_settings_report = {
      settings: {path: 'settings.cfg', revision: 's', values: {}, unknownKeys: [], backupAvailable: false},
      profile: {path: 'profile.cfg', revision: 'p', values: {}, unknownKeys: [], backupAvailable: false},
      bindings: [],
    };
    apex.game_settings_bindings = [{
      id: 'binding:0',
      input: 'w',
      command: '+forward',
      context: 0,
      heldCommand: null,
      editable: true,
      occurrence: 0,
    }];
    apex.original_game_settings_bindings = {'binding:0': 'w'};

    apex.set_game_binding_slot('binding:0', null, 'MWHEELUP', 1);
    let mutation = buildApexGameSettingsMutation(apex);
    expect(mutation?.bindingMutations).toEqual([{
      operation: 'create',
      templateId: 'binding:0',
      input: 'MWHEELUP',
      context: 1,
    }]);

    apex.set_game_binding_slot('binding:0', 'binding:0', '', 0);
    mutation = buildApexGameSettingsMutation(apex);
    expect(mutation?.bindingMutations).toEqual([
      {operation: 'delete', id: 'binding:0'},
      {operation: 'create', templateId: 'binding:0', input: 'MWHEELUP', context: 1},
    ]);
  });

  it('rejects setting and binding edits while a write is in progress', () => {
    const apex = useApexStore();
    adoptApexGameSettingsReport(apex, {
      ...gameSettingsReport('1'),
      bindings: [{
        id: 'binding:0',
        input: 'W',
        command: '+forward',
        context: 0,
        heldCommand: null,
        editable: true,
        occurrence: 0,
      }],
    });
    apex.is_game_settings_saving = true;

    apex.set_game_setting_value('settings', 'mouse_sensitivity', '2');
    apex.set_game_binding_slot('binding:0', 'binding:0', 'S', 0);

    expect(apex.game_settings_values.settings.mouse_sensitivity).toBe('1');
    expect(apex.game_settings_bindings[0].input).toBe('W');
  });
});

describe('Apex quick preset game optimizations', () => {
  it('applies the confirmed settings and idempotent two-slot binding layout', () => {
    const apex = useApexStore();
    apex.game_settings_values.profile = {
      player_setting_damage_closes_deathbox_menu: '1',
      player_setting_stickysprintforward: '0',
      player_setting_autosprint: '0',
      hud_setting_minimapRotate: '0',
      closecaption: '1',
    };
    apex.game_settings_bindings = [
      {id: 'toggle', input: 'MOUSE2', command: '+toggle_zoom', context: 0, heldCommand: null, editable: true, occurrence: 0},
      {id: 'zoom', input: '\\', command: '+zoom', context: 0, heldCommand: null, editable: true, occurrence: 0},
      {id: 'cycle-up', input: 'MWHEELUP', command: '+weaponCycle', context: 0, heldCommand: null, editable: true, occurrence: 0},
      {id: 'cycle-down', input: 'MWHEELDOWN', command: '+weaponCycle', context: 1, heldCommand: null, editable: true, occurrence: 0},
      {id: 'forward', input: 'w', command: '+forward', context: 0, heldCommand: null, editable: true, occurrence: 0},
      {id: 'jump', input: 'SPACE', command: '+jump', context: 0, heldCommand: null, editable: true, occurrence: 0},
    ];
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

    apex.prepare_quick_preset(
      {width: 1920, height: 1080, aspectRatio: 16 / 9, maxRefreshRate: 144},
      selection,
    );
    apex.prepare_quick_preset(
      {width: 1920, height: 1080, aspectRatio: 16 / 9, maxRefreshRate: 144},
      selection,
    );

    expect(apex.game_settings_values.profile).toMatchObject({
      player_setting_damage_closes_deathbox_menu: '0',
      player_setting_stickysprintforward: '1',
      player_setting_autosprint: '1',
      hud_setting_minimapRotate: '1',
      closecaption: '0',
    });
    const active = apex.game_settings_bindings.filter(binding => binding.input);
    expect(active.filter(binding => binding.command === '+toggle_zoom')).toHaveLength(0);
    expect(active.filter(binding => binding.command === '+weaponCycle')).toHaveLength(0);
    expect(active.filter(binding => binding.command === '+zoom').map(binding => binding.input))
      .toEqual(['\\', 'MOUSE2']);
    expect(active.filter(binding => binding.command === '+zoom').map(binding => binding.context))
      .toEqual([0, 1]);
    expect(active.filter(binding => binding.command === '+forward').map(binding => binding.input))
      .toEqual(['w', 'MWHEELUP']);
    expect(active.filter(binding => binding.command === '+forward').map(binding => binding.context))
      .toEqual([0, 1]);
    expect(active.filter(binding => binding.command === '+jump').map(binding => binding.input))
      .toEqual(['SPACE', 'MWHEELDOWN']);
    expect(active.filter(binding => binding.command === '+jump').map(binding => binding.context))
      .toEqual([0, 1]);
  });
});
