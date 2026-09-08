import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import type {ApexConfigMutationRequest} from '@/types/apex_history.ts';
import {quickPresetGameSettingToggles, quickPresetVideoConfigToggles} from '@/data/presets/apex_quick_preset.ts';

const mocks = vi.hoisted(() => ({
  getApexLaunchOption: vi.fn(), getApexLaunchOptionEa: vi.fn(),
  getApexVideoConfig: vi.fn(), getApexConfigFile: vi.fn(), getApexGameSettings: vi.fn(),
  getApexVideoconfigReadonly: vi.fn(), setApexVideoconfigReadonly: vi.fn(),
  mutateApexConfig: vi.fn(), apexIsRunning: vi.fn(), emitApexConfigChanged: vi.fn(),
  error: vi.fn(),
  setApexLaunchOption: vi.fn(), setApexVideoConfig: vi.fn(),
}));
vi.mock('@/ipc/commands.ts', async () => ({
  ...await vi.importActual<typeof import('@/ipc/commands.ts')>('@/ipc/commands.ts'), ...mocks,
}));
vi.mock('@/utils/game/apex_config_events.ts', () => ({emitApexConfigChanged: mocks.emitApexConfigChanged}));
vi.mock('vue-toastification', () => ({useToast: () => ({error: mocks.error, warning: vi.fn(), info: vi.fn()})}));

import {useEaStore} from '@/stores/game/ea.ts';
import {useSteamStore} from '@/stores/game/steam.ts';
import {gameOnlyPreset, presetStore, quickPresetScreen} from './quick_preset_test_helpers.ts';

function setup() {
  const store = presetStore(Object.fromEntries(quickPresetGameSettingToggles.map(([, key]) => [key, '0'])));
  const user = {id: '1', name: 'Test', avatar: '', config_path: 'test/localconfig.vdf'};
  useSteamStore().steam_users = [user];
  store.set_active_apex_account({kind: 'steam', user});
  store.check_miles_language = vi.fn().mockResolvedValue(true);
  store.update_download_language_button_color = vi.fn();
  mocks.getApexGameSettings.mockResolvedValue(JSON.parse(JSON.stringify(store.game_settings_report)));
  mocks.getApexLaunchOption.mockResolvedValue('+exec custom.cfg');
  mocks.getApexLaunchOptionEa.mockResolvedValue('+exec custom.cfg');
  mocks.getApexVideoConfig.mockResolvedValue({'setting.fullscreen': '0', 'setting.configversion': '10'});
  mocks.mutateApexConfig.mockImplementation(async ({request}: {request: ApexConfigMutationRequest}) => ({
    historyEntry: null, changedScopes: ['launch', 'video', 'gameSettings'],
    launchOptions: request.launchOptions,
    videoConfig: {...store.original_video_config, ...request.videoUpdates},
    gameSettingsReport: {
      ...store.game_settings_report,
      profile: {...store.game_settings_report!.profile, values: {...store.game_settings_values.profile}},
    },
  }));
  return store;
}

beforeEach(() => {
  vi.resetAllMocks();
  setActivePinia(createPinia());
  mocks.apexIsRunning.mockResolvedValue(false);
  mocks.getApexVideoconfigReadonly.mockResolvedValue(false);
  mocks.setApexVideoconfigReadonly.mockResolvedValue(undefined);
  mocks.emitApexConfigChanged.mockResolvedValue(undefined);
});

describe('Quick preset load, prepare, commit and synchronize workflow', () => {
  it.each(['steam', 'ea'] as const)('applies all scopes for %s after refreshing disk state', async kind => {
    const store = setup();
    if (kind === 'ea') {
      useEaStore().ea_desktop_users = [{
        id: '2', name: 'EA', avatar: '', config_path: 'test/user_2.ini', user_userid: '2', nu_hash: '',
      }];
      store.set_active_apex_account({kind, user: {
        id: '2', name: 'EA', avatar: '', config_path: 'test/user_2.ini', user_userid: '2', nu_hash: '',
      }});
    }
    await store.ensure_configs_loaded_for_preset();
    store.prepare_quick_preset(quickPresetScreen, {
      ...gameOnlyPreset(Object.fromEntries(quickPresetGameSettingToggles.map(([id]) => [id, true]))),
      enableResolutionPreset: true, enableGraphicsPreset: true,
      videoOptions: Object.fromEntries(quickPresetVideoConfigToggles.map(option => [option.key, true])),
    });
    expect(await store.apply_quick_preset_persist()).toBe(true);
    expect(mocks.mutateApexConfig).toHaveBeenCalledTimes(1);
    expect(mocks.setApexLaunchOption).not.toHaveBeenCalled();
    expect(mocks.setApexVideoConfig).not.toHaveBeenCalled();
    const request = mocks.mutateApexConfig.mock.calls[0]![0].request;
    expect(request.launcher.kind).toBe(kind);
    expect(request.source).toBe('quickPreset');
    expect(request.transactionId).toBeTruthy();
    expect(request.launchOptions).toContain('+exec custom.cfg');
    expect(request.launchOptions).toContain('+fps_max 144');
    expect(request.videoUpdates['setting.defaultres']).toBe('1920');
    expect(request.gameSettings.profileUpdates.sprint_view_shake_style).toBe('1');
    expect(mocks.setApexVideoconfigReadonly).toHaveBeenCalledWith({locked: true});
    expect(store.original_video_config).toEqual(store.video_config_values);
    expect(mocks.emitApexConfigChanged).toHaveBeenCalledWith(
      ['launch', 'video', 'gameSettings'], {notification: 'quickPresetApplied'},
    );
    expect(store.quick_preset_applying).toBe(false);
  });

  it.each(['launch', 'video', 'settings'])('blocks a failed %s refresh even with cached data', async scope => {
    const store = setup();
    const error = new Error('read failed');
    if (scope === 'launch') mocks.getApexLaunchOption.mockRejectedValue(error);
    if (scope === 'video') {
      mocks.getApexVideoConfig.mockRejectedValue(error);
      mocks.getApexConfigFile.mockRejectedValue(error);
    }
    if (scope === 'settings') mocks.getApexGameSettings.mockRejectedValue(error);
    await expect(store.ensure_configs_loaded_for_preset()).rejects.toThrow();
    expect(mocks.mutateApexConfig).not.toHaveBeenCalled();
  });

  it.each(['language', 'running', 'account'])('blocks writes when %s prerequisite fails', async reason => {
    const store = setup();
    if (reason === 'language') store.check_miles_language = vi.fn().mockResolvedValue(false);
    if (reason === 'running') mocks.apexIsRunning.mockResolvedValue(true);
    if (reason === 'account') useSteamStore().steam_users = [];
    expect(await store.apply_quick_preset_persist()).toBe(false);
    expect(mocks.mutateApexConfig).not.toHaveBeenCalled();
    expect(store.quick_preset_applying).toBe(false);
  });

  it('keeps failed native transactions free of success notifications', async () => {
    const store = setup();
    mocks.mutateApexConfig.mockRejectedValue(new Error('write rolled back'));
    expect(await store.apply_quick_preset_persist()).toBe(false);
    expect(mocks.emitApexConfigChanged).not.toHaveBeenCalled();
    expect(store.quick_preset_applying).toBe(false);
  });

  it.each(['mismatch', 'missing', 'readonly'])('synchronizes committed state without success on %s failure', async failure => {
    const store = setup();
    store.video_config_values = {'setting.fullscreen': '1', 'setting.configversion': '10'};
    store.original_video_config = {'setting.fullscreen': '0', 'setting.configversion': '10'};
    if (failure === 'readonly') mocks.setApexVideoconfigReadonly.mockRejectedValue(new Error('denied'));
    else mocks.mutateApexConfig.mockResolvedValue({
      historyEntry: null, changedScopes: ['video'], launchOptions: null,
      videoConfig: failure === 'missing' ? null : {'setting.fullscreen': '0'}, gameSettingsReport: null,
    });
    expect(await store.apply_quick_preset_persist()).toBe(false);
    expect(mocks.emitApexConfigChanged).toHaveBeenCalledWith(expect.any(Array), undefined);
    expect(store.quick_preset_applying).toBe(false);
    if (failure === 'mismatch') expect(store.video_config_values['setting.fullscreen']).toBe('0');
    if (failure === 'missing') expect(store.video_config_load_status).toBe('error');
    if (failure !== 'readonly') expect(mocks.setApexVideoconfigReadonly).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenLastCalledWith(expect.stringContaining(
      failure === 'readonly' ? 'videoProtectionFailed' : 'videoVerificationFailed',
    ), {timeout: 8000});
  });

  it('does not lock a launcher-only preset', async () => {
    const store = setup();
    await store.ensure_configs_loaded_for_preset();
    store.prepare_quick_preset(quickPresetScreen, gameOnlyPreset({}));
    expect(await store.apply_quick_preset_persist()).toBe(true);
    expect(mocks.setApexVideoconfigReadonly).not.toHaveBeenCalled();
    expect(mocks.mutateApexConfig.mock.calls[0]![0].request.videoUpdates).toEqual({});
  });

  it('retries read-only protection even when selected values already match disk', async () => {
    const store = setup();
    const selection = {...gameOnlyPreset({}), videoOptions: {disable_vsync: true}};
    await store.ensure_configs_loaded_for_preset();
    store.prepare_quick_preset(quickPresetScreen, selection);
    mocks.setApexVideoconfigReadonly.mockRejectedValueOnce(new Error('denied'));
    expect(await store.apply_quick_preset_persist()).toBe(false);
    mocks.getApexVideoConfig.mockResolvedValue({...store.video_config_values});
    await store.ensure_configs_loaded_for_preset();
    store.prepare_quick_preset(quickPresetScreen, selection);
    expect(await store.apply_quick_preset_persist()).toBe(true);
    expect(mocks.setApexVideoconfigReadonly).toHaveBeenCalledTimes(2);
    expect(mocks.mutateApexConfig.mock.calls[1]![0].request.videoUpdates)
      .not.toHaveProperty('setting.fullscreen');
  });

  it('rejects account changes during prerequisite checks', async () => {
    const store = setup();
    const other = {id: '2', name: 'Other', avatar: '', config_path: 'test/2/localconfig.vdf'};
    useSteamStore().steam_users.push(other);
    store.check_miles_language = vi.fn().mockImplementation(async () => {
      store.set_active_apex_account({kind: 'steam', user: other});
      return true;
    });
    expect(await store.apply_quick_preset_persist()).toBe(false);
    expect(mocks.mutateApexConfig).not.toHaveBeenCalled();
  });

  it('rejects account changes during the final disk refresh', async () => {
    const store = setup();
    const other = {id: '2', name: 'Other', avatar: '', config_path: 'test/2/localconfig.vdf'};
    useSteamStore().steam_users.push(other);
    const report = JSON.parse(JSON.stringify(store.game_settings_report));
    mocks.getApexGameSettings.mockImplementation(async () => {
      store.set_active_apex_account({kind: 'steam', user: other});
      return report;
    });
    await expect(store.ensure_configs_loaded_for_preset()).rejects.toThrow();
    expect(mocks.mutateApexConfig).not.toHaveBeenCalled();
  });

  it('rejects duplicate submission and releases the busy state after notification failure', async () => {
    const store = setup();
    mocks.emitApexConfigChanged.mockRejectedValue(new Error('window closed'));
    const first = store.apply_quick_preset_persist();
    expect(await store.apply_quick_preset_persist()).toBe(false);
    expect(await first).toBe(true);
    expect(mocks.mutateApexConfig).toHaveBeenCalledTimes(1);
    expect(store.quick_preset_applying).toBe(false);
  });
});
