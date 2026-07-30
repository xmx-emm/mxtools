import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import type {ApexConfigSnapshot} from '@/types/apex_config_snapshot.ts';
import type {ApexGameSettingsReport} from '@/types/apex_game_settings.ts';
import type {SteamUser} from '@/types/steam.ts';

const mocks = vi.hoisted(() => ({
  apexIsRunning: vi.fn(),
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

import {useApexStore} from './index.ts';
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
          bindingUpdates: [],
        },
      }),
    });
  });
});
