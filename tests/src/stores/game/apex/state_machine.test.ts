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
} from '@/stores/game/apex/actions_settings.ts';

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
