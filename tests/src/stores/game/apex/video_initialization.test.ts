import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import {quickPresetVideoConfigToggles} from '@/data/presets/apex_quick_preset.ts';
import {initVideoOptionsForDialog} from '@/utils/game/apex_quick_preset.ts';
import {isApexVideoConfigInitialized} from '@/utils/game/apex_video_config.ts';

const mocks = vi.hoisted(() => ({
  getApexVideoConfig: vi.fn(), getApexVideoconfigReadonly: vi.fn(),
  getApexConfigFile: vi.fn(),
  setApexVideoconfigReadonly: vi.fn(), prepareApexVideoConfigRegeneration: vi.fn(),
  mutateApexConfig: vi.fn(), apexIsRunning: vi.fn(), emitApexConfigChanged: vi.fn(),
  error: vi.fn(), info: vi.fn(),
}));
vi.mock('@/ipc/commands.ts', async () => ({
  ...await vi.importActual<typeof import('@/ipc/commands.ts')>('@/ipc/commands.ts'), ...mocks,
}));
vi.mock('@/utils/game/apex_config_events.ts', () => ({emitApexConfigChanged: mocks.emitApexConfigChanged}));
vi.mock('vue-toastification', () => ({useToast: () => ({error: mocks.error, info: mocks.info})}));

import {useSteamStore} from '@/stores/game/steam.ts';
import {useEaStore} from '@/stores/game/ea.ts';
import {gameOnlyPreset, presetStore, quickPresetScreen} from './quick_preset_test_helpers.ts';

beforeEach(() => {
  vi.resetAllMocks();
  setActivePinia(createPinia());
  mocks.apexIsRunning.mockResolvedValue(false);
  mocks.getApexVideoconfigReadonly.mockResolvedValue(false);
  mocks.emitApexConfigChanged.mockResolvedValue(undefined);
});

const presetValues = Object.assign({}, ...quickPresetVideoConfigToggles.map(option => option.onValues));

describe.each(['steam', 'ea'] as const)('%s video initialization', kind => {
  function setup(values: Record<string, string>) {
    const store = presetStore({});
    const user = {id: '1', name: 'Test', avatar: '', config_path: 'test.cfg', user_userid: '1', nu_hash: ''};
    if (kind === 'steam') useSteamStore().steam_users = [user];
    else useEaStore().ea_desktop_users = [user];
    store.set_active_apex_account({kind, user});
    store.check_miles_language = vi.fn().mockResolvedValue(true);
    mocks.getApexVideoConfig.mockResolvedValue(values);
    return store;
  }

  it.each([{}, presetValues])('rejects missing or legacy partial video without accepting a no-op as success', async values => {
    const store = setup(values);
    await store.load_apex_video_config();
    expect(store.video_config_needs_generation).toBe(true);
    expect(store.reset_pending_scopes).toContain('video');
    expect(Object.values(initVideoOptionsForDialog(values)).some(Boolean)).toBe(false);
    expect(mocks.prepareApexVideoConfigRegeneration).not.toHaveBeenCalled();
    store.prepare_quick_preset(quickPresetScreen, {
      ...gameOnlyPreset({}),
      videoOptions: Object.fromEntries(quickPresetVideoConfigToggles.map(option => [option.key, true])),
    });
    expect(await store.apply_quick_preset_persist()).toBe(false);
    expect(await store.apply_apex_video_config()).toBe(false);
    expect(await store.set_videoconfig_readonly(true)).toBe(false);
    expect(mocks.mutateApexConfig).not.toHaveBeenCalled();
    expect(mocks.setApexVideoconfigReadonly).not.toHaveBeenCalled();
    expect(mocks.emitApexConfigChanged).not.toHaveBeenCalled();
  });

  it('allows launcher-only presets while waiting for video generation', async () => {
    const store = setup({});
    await store.load_apex_video_config();
    store.prepare_quick_preset(quickPresetScreen, gameOnlyPreset({}));
    mocks.mutateApexConfig.mockResolvedValue({changedScopes: ['launch'], launchOptions: store.launch_options});
    expect(await store.apply_quick_preset_persist()).toBe(true);
    expect(mocks.mutateApexConfig.mock.calls[0]![0].request.videoUpdates).toEqual({});
    expect(mocks.setApexVideoconfigReadonly).not.toHaveBeenCalled();
  });

  it('repairs only on explicit action and waits until the game generates its version', async () => {
    const store = setup(presetValues);
    await store.load_apex_video_config();
    mocks.getApexVideoConfig.mockResolvedValue({});
    expect(await store.prepare_video_config_regeneration()).toBe(true);
    expect(mocks.prepareApexVideoConfigRegeneration).toHaveBeenCalledTimes(1);
    expect(mocks.emitApexConfigChanged).toHaveBeenCalledWith(['video']);
    expect(store.reset_pending_scopes).toContain('video');
    expect(store.video_config_needs_generation).toBe(true);
    mocks.getApexVideoConfig.mockResolvedValue({'setting.configversion': '10', ...presetValues});
    await store.load_apex_video_config({force: true});
    expect(store.video_config_needs_generation).toBe(false);
    expect(store.reset_pending_scopes).not.toContain('video');
    expect(Object.values(initVideoOptionsForDialog(store.video_config_values)).every(Boolean)).toBe(true);
  });

  it('keeps the current state after failed recovery and releases its busy flag', async () => {
    const store = setup(presetValues);
    await store.load_apex_video_config();
    mocks.prepareApexVideoConfigRegeneration.mockRejectedValue(new Error('apex.history.errors.apexRunning'));
    expect(await store.prepare_video_config_regeneration()).toBe(false);
    expect(store.video_config_values).toEqual(presetValues);
    expect(store.is_video_config_saving).toBe(false);
    expect(mocks.emitApexConfigChanged).not.toHaveBeenCalled();
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it('notifies other windows without a completion toast when recovery readback fails', async () => {
    const store = setup(presetValues);
    await store.load_apex_video_config();
    mocks.getApexVideoConfig.mockRejectedValue(new Error('read failed'));
    mocks.getApexConfigFile.mockRejectedValue(new Error('read failed'));
    expect(await store.prepare_video_config_regeneration()).toBe(false);
    expect(mocks.emitApexConfigChanged).toHaveBeenCalledWith(['video']);
    expect(mocks.info).not.toHaveBeenCalled();
    expect(store.is_video_config_saving).toBe(false);
  });
});

it('recognizes game versions without assigning a fixed version to new files', () => {
  for (const version of ['1', '10', '11', '4294967295']) {
    expect(isApexVideoConfigInitialized({'setting.configversion': version})).toBe(true);
  }
  for (const version of ['', '0', '-1', '+10', '10.0', ' 10', '4294967296', 'bad']) {
    expect(isApexVideoConfigInitialized({'setting.configversion': version})).toBe(false);
  }
});
