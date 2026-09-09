import {beforeEach, describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';

const mocks = vi.hoisted(() => ({
  resetApexToGameDefaults: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  emitApexConfigChanged: vi.fn(),
  getApexVideoconfigReadonly: vi.fn(),
}));

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    info: mocks.info,
    error: mocks.error,
    success: mocks.success,
    warning: mocks.warning,
  }),
}));

vi.mock('@/ipc/commands.ts', async () => {
  const actual = await vi.importActual<typeof import('@/ipc/commands.ts')>('@/ipc/commands.ts');
  return {...actual, resetApexToGameDefaults: mocks.resetApexToGameDefaults,
    getApexVideoconfigReadonly: mocks.getApexVideoconfigReadonly};
});
vi.mock('@/utils/game/apex_config_events.ts', () => ({emitApexConfigChanged: mocks.emitApexConfigChanged}));

import {apexHistoryActions} from '@/stores/game/apex/actions_history.ts';
import type {ApexStoreThis} from '@/stores/game/apex/types.ts';
import {createApexState} from '@/stores/game/apex/state.ts';
import {apexVideoActions} from '@/stores/game/apex/actions_video.ts';

function resetStore(kind: 'steam' | 'ea') {
  return {
    ...createApexState(),
    active_apex_account: {
      kind,
      user: {id: '1', name: 'Steam 1', avatar: '', config_path: 'localconfig.vdf'},
    },
    is_resetting_defaults: false,
    reset_defaults_dialog: true,
    launcher_selection_key: `${kind}:1`,
    video_config_request_generation: 0,
    game_settings_request_generation: 0,
    parse_loaded_launch_string: vi.fn(),
    load_apex_video_config: vi.fn().mockResolvedValue(undefined),
    load_apex_game_settings: vi.fn().mockResolvedValue(undefined),
    load_config_history: vi.fn().mockResolvedValue(undefined),
  } as unknown as ApexStoreThis;
}

const completeVideo = Object.fromEntries([...readFileSync(
  new URL('../../../../fixtures/apex/videoconfig-v10.txt', import.meta.url), 'utf8',
).matchAll(/"(setting\.[^"]+)"\s+"([^"]*)"/g)].map(match => [match[1], match[2]]));
function result() {
  return {
    historyEntry: {id: 'reset-1'}, pendingScopes: [], videoConfig: {...completeVideo},
    gameSettingsReport: {
      settings: {path: 'settings.cfg', revision: 'new-settings', exists: true, values: {}, unknownKeys: [], backupAvailable: false},
      profile: {path: 'profile.cfg', revision: 'new-profile', exists: true, values: {closecaption: '1'}, unknownKeys: [], backupAvailable: false},
      bindings: [{id: 'aim', input: 'MOUSE2', command: '+toggle_zoom', heldCommand: null, context: 0, editable: true, occurrence: 0}],
    },
  };
}

describe.each(['steam', 'ea'] as const)('%s immediate Apex reset', kind => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.emitApexConfigChanged.mockResolvedValue(undefined);
  });

  it('describes a repeated reset as an informational no-op', async () => {
    mocks.resetApexToGameDefaults.mockResolvedValue({...result(), historyEntry: null});
    const store = resetStore(kind);
    store.video_config_values = {'stale': '1'};

    await expect(apexHistoryActions.reset_apex_to_defaults.call(store)).resolves.toBe(true);

    expect(store.reset_defaults_dialog).toBe(false);
    expect(mocks.info).toHaveBeenCalledWith('apex.history.resetNoChanges');
    expect(mocks.error).not.toHaveBeenCalled();
    expect(store.is_resetting_defaults).toBe(false);
    expect(store.video_config_values).toEqual(completeVideo);
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('keeps actual reset failures as errors', async () => {
    mocks.resetApexToGameDefaults.mockRejectedValue({
      code: 'apex_history.write_failed',
      message: 'disk write failed',
    });
    const store = resetStore(kind);
    store.video_config_values = {'stale': '1'};

    await expect(apexHistoryActions.reset_apex_to_defaults.call(store)).resolves.toBe(false);

    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledOnce();
    expect(store.reset_defaults_dialog).toBe(true);
    expect(store.is_resetting_defaults).toBe(false);
    expect(store.video_config_values).toEqual({'stale': '1'});
    expect(mocks.emitApexConfigChanged).not.toHaveBeenCalled();
  });

  it('adopts verified configuration and clears pending, dirty, loading, and readonly state', async () => {
    const response = result();
    mocks.resetApexToGameDefaults.mockResolvedValue(response);
    const store = resetStore(kind);
    store.reset_pending_scopes = ['video', 'gameSettings'];
    store.is_videoconfig_readonly = true;
    store.is_video_config_loading = true;
    store.is_game_settings_loading = true;
    store.video_config_load_error = 'old error';

    await expect(apexHistoryActions.reset_apex_to_defaults.call(store)).resolves.toBe(true);

    expect(store.reset_pending_scopes).toEqual([]);
    expect(store.video_config_values).toEqual(completeVideo);
    expect(store.original_video_config).toEqual(completeVideo);
    expect(store.video_config_load_status).toBe('ready');
    expect(store.video_config_load_error).toBeNull();
    expect(store.game_settings_report).toEqual(response.gameSettingsReport);
    expect(store.game_settings_values.profile).toEqual({closecaption: '1'});
    expect(store.original_game_settings_bindings).toEqual({aim: 'MOUSE2'});
    expect(store.is_videoconfig_readonly).toBe(false);
    expect(store.is_video_config_loading).toBe(false);
    expect(store.is_game_settings_loading).toBe(false);
    expect(store.video_config_request_generation).toBe(1);
    expect(store.game_settings_request_generation).toBe(1);
    expect(store.parse_loaded_launch_string).toHaveBeenCalledWith('');
    expect(store.load_apex_video_config).not.toHaveBeenCalled();
    expect(store.load_apex_game_settings).not.toHaveBeenCalled();
    expect(mocks.emitApexConfigChanged).toHaveBeenCalledWith(['launch', 'video', 'gameSettings']);
    expect(store.load_config_history).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledWith('apex.history.resetSuccess');
    expect(store.is_resetting_defaults).toBe(false);
  });

  it('rejects incomplete native results without a success notification', async () => {
    const response = result();
    delete response.videoConfig['setting.shadow_enable'];
    mocks.resetApexToGameDefaults.mockResolvedValue(response);
    const store = resetStore(kind);
    expect(await apexHistoryActions.reset_apex_to_defaults.call(store)).toBe(false);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledOnce();
  });

  it('keeps a new account’s launch state when account selection changes during reset', async () => {
    let finish!: (value: ReturnType<typeof result>) => void;
    mocks.resetApexToGameDefaults.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const store = resetStore(kind);
    const pending = apexHistoryActions.reset_apex_to_defaults.call(store);
    store.launcher_selection_key = `${kind}:2`;
    store.custom_launch_options = 'other account';
    finish(result());
    expect(await pending).toBe(true);
    expect(store.parse_loaded_launch_string).not.toHaveBeenCalled();
    expect(store.custom_launch_options).toBe('other account');
    expect(store.video_config_loaded_key).toBe('machine');
  });

  it('does not let an older readonly read replace the verified reset state', async () => {
    let finish!: (value: boolean) => void;
    mocks.getApexVideoconfigReadonly.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    mocks.resetApexToGameDefaults.mockResolvedValue(result());
    const store = resetStore(kind);
    const oldRead = apexVideoActions.load_videoconfig_readonly.call(store);
    expect(await apexHistoryActions.reset_apex_to_defaults.call(store)).toBe(true);
    finish(true);
    await oldRead;
    expect(store.is_videoconfig_readonly).toBe(false);
  });

  it('reports cross-window refresh failures while retaining the completed reset', async () => {
    mocks.resetApexToGameDefaults.mockResolvedValue(result());
    mocks.emitApexConfigChanged.mockRejectedValue(new Error('event unavailable'));
    const store = resetStore(kind);
    expect(await apexHistoryActions.reset_apex_to_defaults.call(store)).toBe(true);
    expect(mocks.warning).toHaveBeenCalledWith('apex.history.resetSyncFailed');
    expect(store.video_config_values).toEqual(completeVideo);
  });

  it('rejects duplicate submissions', async () => {
    const store = resetStore(kind);
    store.is_resetting_defaults = true;
    expect(await apexHistoryActions.reset_apex_to_defaults.call(store)).toBe(false);
    expect(mocks.resetApexToGameDefaults).not.toHaveBeenCalled();
  });
});
