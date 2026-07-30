import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import type {SteamUser} from '@/types/steam.ts';
import type {ApexConfigSnapshot} from '@/types/apex_config_snapshot.ts';

const mocks = vi.hoisted(() => ({
  getApexLaunchOption: vi.fn(),
  getApexVideoConfig: vi.fn(),
  mutateApexConfig: vi.fn(),
  setApexLaunchOption: vi.fn(),
  setApexLaunchOptionEa: vi.fn(),
  setApexVideoConfig: vi.fn(),
  apexIsRunning: vi.fn(),
  getApexVideoconfigReadonly: vi.fn(),
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return {promise, resolve};
}

function steamUser(id: string): SteamUser {
  return {id, name: `Steam ${id}`, avatar: '', config_path: `C:/steam/${id}/localconfig.vdf`};
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  mocks.apexIsRunning.mockResolvedValue(false);
  mocks.getApexVideoconfigReadonly.mockResolvedValue(false);
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
