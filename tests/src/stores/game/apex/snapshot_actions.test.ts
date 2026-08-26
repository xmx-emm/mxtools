import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import type {ApexConfigSnapshot} from '@/types/apex_config_snapshot.ts';
import type {ApexGameSettingsReport} from '@/types/apex_game_settings.ts';
import type {SteamUser} from '@/types/steam.ts';
import {
  apexConfigSnapshotFilename,
  parseApexConfigSnapshot,
} from '@/utils/game/apex_config_snapshot.ts';

const mocks = vi.hoisted(() => ({
  apexIsRunning: vi.fn(),
  checkApexMilesLanguage: vi.fn(),
  getApexVideoconfigReadonly: vi.fn(),
  mutateApexConfig: vi.fn(),
  writeUtf8File: vi.fn(),
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

import {useApexStore} from '@/stores/game/apex/index.ts';
import {useSteamStore} from '@/stores/game/steam.ts';

const settingsValues = {
  mouse_sensitivity: '1',
  gfx_nvnUseLowLatency: '1',
  custom_settings_key: 'ignore',
};

const profileValues = {
  cl_fovScale: '1.5',
  gamepad_aim_speed: '2',
  gamepad_aim_speed_ads_3: '3',
  CrossPlay_user_optin: '1',
  custom_profile_key: 'ignore',
};

function steamUser(): SteamUser {
  return {
    id: '1',
    name: 'Steam 1',
    avatar: '',
    config_path: 'C:/steam/1/localconfig.vdf',
  };
}

function gameSettingsReport(): ApexGameSettingsReport {
  return {
    settings: {
      path: 'C:/Apex/settings.cfg',
      revision: 'settings-r1',
      values: {...settingsValues},
      unknownKeys: ['custom_settings_key'],
      backupAvailable: false,
    },
    profile: {
      path: 'C:/Apex/profile.cfg',
      revision: 'profile-r1',
      values: {...profileValues},
      unknownKeys: ['custom_profile_key'],
      backupAvailable: false,
    },
    bindings: [{
      id: 'binding-attack',
      input: 'MOUSE1',
      command: '+attack',
      context: 0,
      heldCommand: null,
      editable: true,
      occurrence: 0,
    }],
  };
}

function prepareLoadedStore() {
  const steam = useSteamStore();
  const apex = useApexStore();
  const user = steamUser();
  steam.steam_users = [user];
  apex.set_active_apex_account({kind: 'steam', user});
  apex.launch_loaded_for_key = 'steam:1';
  apex.video_config_loaded = true;
  apex.video_config_values = {'setting.fullscreen': '1'};
  apex.game_settings_loaded = true;
  apex.game_settings_report = gameSettingsReport();
  apex.game_settings_values = {
    settings: {...settingsValues},
    profile: {...profileValues},
  };
  apex.original_game_settings_values = {
    settings: {...settingsValues},
    profile: {...profileValues},
  };
  apex.game_settings_bindings = gameSettingsReport().bindings;
  apex.original_game_settings_bindings = {['binding-attack']: 'MOUSE1'};
  return apex;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  mocks.apexIsRunning.mockResolvedValue(false);
  mocks.checkApexMilesLanguage.mockResolvedValue(true);
  mocks.getApexVideoconfigReadonly.mockResolvedValue(false);
  mocks.mutateApexConfig.mockResolvedValue({
    historyEntry: null,
    changedScopes: ['gameSettings'],
    launchOptions: null,
    videoConfig: null,
    gameSettingsReport: null,
  });
});

describe('Apex snapshot export automation', () => {
  it('writes a version-1 controller-only snapshot and excludes unknown keys', async () => {
    const apex = prepareLoadedStore();

    await apex.export_config_snapshot_to_file('C:/tmp/apex-controller.json', {
      launchOptions: false,
      videoConfig: false,
      gameSettings: false,
      aiming: false,
      controller: true,
      bindings: false,
    });

    expect(mocks.writeUtf8File).toHaveBeenCalledTimes(1);
    const {content} = mocks.writeUtf8File.mock.calls[0][0];
    const written = JSON.parse(content) as ApexConfigSnapshot;
    expect(written).toMatchObject({
      version: 1,
      kind: 'apex-config-snapshot',
      gameSettings: {
        settings: {},
        profile: {
          gamepad_aim_speed: '2',
          gamepad_aim_speed_ads_3: '3',
        },
      },
    });
    expect(content).not.toContain('custom_settings_key');
    expect(content).not.toContain('custom_profile_key');
    expect(content).not.toContain('mouse_sensitivity');
  });

  it('does not require unselected sources to be loaded', async () => {
    const apex = prepareLoadedStore();
    apex.video_config_values['setting.configversion'] = '7';
    apex.game_settings_loaded = false;
    apex.game_settings_report = null;
    apex.launch_loaded_for_key = null;

    await apex.export_config_snapshot_to_file('C:/tmp/apex-video.json', {
      launchOptions: false,
      videoConfig: true,
      gameSettings: false,
      aiming: false,
      controller: false,
      bindings: false,
    });

    const written = JSON.parse(mocks.writeUtf8File.mock.calls[0][0].content) as ApexConfigSnapshot;
    expect(written.videoConfig).toEqual({'setting.fullscreen': '1'});
    expect(written.launchOptions).toBeUndefined();
    expect(written.gameSettings).toBeUndefined();
  });
});

describe('Apex snapshot import/export workflow', () => {
  it('imports the JSON written to a timestamped export path', async () => {
    const apex = prepareLoadedStore();
    const filename = apexConfigSnapshotFilename(new Date(2026, 0, 2, 3, 4, 5));
    const path = `C:/tmp/${filename}`;

    await apex.export_config_snapshot_to_file(path, {
      launchOptions: false,
      videoConfig: true,
      gameSettings: true,
      aiming: false,
      controller: false,
      bindings: false,
    });

    expect(mocks.writeUtf8File).toHaveBeenCalledWith({
      path: 'C:/tmp/apex-config-snapshot-2026-01-02-03-04-05.json',
      content: expect.any(String),
    });
    const snapshot = parseApexConfigSnapshot(mocks.writeUtf8File.mock.calls[0][0].content);

    apex.video_config_values = {'setting.fullscreen': '0'};
    apex.original_video_config = {'setting.fullscreen': '0'};
    apex.game_settings_values.settings.gfx_nvnUseLowLatency = '0';
    apex.original_game_settings_values.settings.gfx_nvnUseLowLatency = '0';
    apex.game_settings_values.profile.CrossPlay_user_optin = '0';
    apex.original_game_settings_values.profile.CrossPlay_user_optin = '0';

    const applied = await apex.apply_config_snapshot(snapshot, {
      importLaunchOptions: false,
      importVideoConfig: true,
      videoSelectMode: 'all',
      selectedVideoItemIds: [],
      importGameSettings: true,
      importAiming: false,
      importController: false,
      importBindings: false,
    });

    expect(applied).toBe(true);
    expect(mocks.mutateApexConfig).toHaveBeenCalledWith({
      request: expect.objectContaining({
        source: 'import',
        launchOptions: null,
        videoUpdates: {'setting.fullscreen': '1'},
        gameSettings: {
          settingsRevision: 'settings-r1',
          profileRevision: 'profile-r1',
          settingsUpdates: {gfx_nvnUseLowLatency: '1'},
          profileUpdates: {CrossPlay_user_optin: '1'},
          bindingMutations: [],
        },
      }),
    });
  });
});

describe('Apex snapshot video import automation', () => {
  it('never sends the game-managed config version to the transaction', async () => {
    const apex = prepareLoadedStore();
    const applied = await apex.apply_config_snapshot({
      version: 1,
      kind: 'apex-config-snapshot',
      exportedAt: '2026-07-29T00:00:00.000Z',
      videoConfig: {
        'setting.configversion': '7',
        'setting.fullscreen': '0',
      },
    }, {
      importLaunchOptions: false,
      importVideoConfig: true,
      videoSelectMode: 'all',
      selectedVideoItemIds: [],
    });

    expect(applied).toBe(true);
    expect(mocks.mutateApexConfig).toHaveBeenCalledWith({
      request: expect.objectContaining({
        videoUpdates: {'setting.fullscreen': '0'},
      }),
    });
  });
});

describe.each([
  {
    name: 'keyboard/mouse aiming',
    selection: {importAiming: true, importController: false},
    settingsUpdates: {mouse_sensitivity: '1.25'},
    profileUpdates: {cl_fovScale: '1.7'},
  },
  {
    name: 'controller aiming',
    selection: {importAiming: false, importController: true},
    settingsUpdates: {},
    profileUpdates: {
      gamepad_aim_speed: '4',
      gamepad_aim_speed_ads_3: '5',
    },
  },
])('Apex snapshot $name import automation', ({selection, settingsUpdates, profileUpdates}) => {
  it('sends only the selected input-method settings to the transaction', async () => {
    const apex = prepareLoadedStore();
    apex.game_settings_values.settings.gfx_nvnUseLowLatency = '0';
    apex.game_settings_values.profile.CrossPlay_user_optin = '0';
    const snapshot: ApexConfigSnapshot = {
      version: 1,
      kind: 'apex-config-snapshot',
      exportedAt: '2026-07-29T00:00:00.000Z',
      gameSettings: {
        settings: {
          mouse_sensitivity: '1.25',
          gfx_nvnUseLowLatency: '0',
        },
        profile: {
          cl_fovScale: '1.7',
          gamepad_aim_speed: '4',
          gamepad_aim_speed_ads_3: '5',
          CrossPlay_user_optin: '0',
        },
      },
    };

    const applied = await apex.apply_config_snapshot(snapshot, {
      importLaunchOptions: false,
      importVideoConfig: false,
      videoSelectMode: 'all',
      selectedVideoItemIds: [],
      importGameSettings: false,
      importAiming: selection.importAiming,
      importController: selection.importController,
      importBindings: false,
    });

    expect(applied).toBe(true);
    expect(mocks.mutateApexConfig).toHaveBeenCalledTimes(1);
    expect(mocks.mutateApexConfig).toHaveBeenCalledWith({
      request: expect.objectContaining({
        source: 'import',
        launchOptions: null,
        videoUpdates: {},
        gameSettings: {
          settingsRevision: 'settings-r1',
          profileRevision: 'profile-r1',
          settingsUpdates,
          profileUpdates,
          bindingMutations: [],
        },
      }),
    });
  });
});

describe('Apex snapshot binding reconciliation', () => {
  it('creates, updates, and deletes context slots from a clean report', async () => {
    const apex = prepareLoadedStore();
    const bindings = [
      {
        id: 'binding-zoom-0', input: 'MOUSE2', command: '+zoom', context: 0,
        heldCommand: '+zoom_held', editable: true, occurrence: 0,
      },
      {
        id: 'binding-zoom-1', input: 'MOUSE3', command: '+zoom', context: 1,
        heldCommand: '+zoom_held', editable: true, occurrence: 0,
      },
      {
        id: 'binding-forward-0', input: 'W', command: '+forward', context: 0,
        heldCommand: '+forward_held', editable: true, occurrence: 0,
      },
      {
        id: 'binding-melee-0', input: 'V', command: '+melee', context: 0,
        heldCommand: null, editable: true, occurrence: 0,
      },
    ];
    apex.game_settings_report = {
      ...gameSettingsReport(),
      bindings,
    };
    apex.game_settings_bindings = bindings.map(binding => ({...binding}));
    apex.original_game_settings_bindings = Object.fromEntries(
      bindings.map(binding => [binding.id, binding.input]),
    );

    const applied = await apex.apply_config_snapshot({
      version: 1,
      kind: 'apex-config-snapshot',
      exportedAt: '2026-07-29T00:00:00.000Z',
      gameSettings: {
        settings: {},
        profile: {},
        bindings: [
          {
            input: 'MOUSE4', command: '+zoom', context: 1,
            heldCommand: '+zoom_held', occurrence: 0,
          },
          {
            input: 'W', command: '+forward', context: 0,
            heldCommand: '+forward_held', occurrence: 0,
          },
          {
            input: 'SPACE', command: '+forward', context: 1,
            heldCommand: '+forward_held', occurrence: 0,
          },
        ],
      },
    }, {
      importLaunchOptions: false,
      importVideoConfig: false,
      videoSelectMode: 'all',
      selectedVideoItemIds: [],
      importGameSettings: false,
      importAiming: false,
      importController: false,
      importBindings: true,
    });

    expect(applied).toBe(true);
    const request = mocks.mutateApexConfig.mock.calls[0][0].request;
    expect(request.gameSettings.bindingMutations).toEqual([
      {operation: 'delete', id: 'binding-zoom-0'},
      {operation: 'update', id: 'binding-zoom-1', input: 'MOUSE4'},
      {operation: 'create', templateId: 'binding-forward-0', input: 'SPACE', context: 1},
      {operation: 'delete', id: 'binding-melee-0'},
    ]);
  });
});

describe('Apex snapshot launch validation', () => {
  it('checks the language contained in the snapshot instead of the local draft', async () => {
    const apex = prepareLoadedStore();
    const applied = await apex.apply_config_snapshot({
      version: 1,
      kind: 'apex-config-snapshot',
      exportedAt: '2026-07-29T00:00:00.000Z',
      launchOptions: {raw: '+miles_language japanese +fps_max 240'},
    }, {
      importLaunchOptions: true,
      importVideoConfig: false,
      videoSelectMode: 'all',
      selectedVideoItemIds: [],
    });

    expect(applied).toBe(true);
    expect(mocks.checkApexMilesLanguage).toHaveBeenCalledWith({
      language: 'japanese',
      platform: 'steam',
      eaUserId: null,
    });
  });
});
