import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  resetApexToGameDefaults: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    info: mocks.info,
    error: mocks.error,
    success: mocks.success,
  }),
}));

vi.mock('@/ipc/commands.ts', async () => {
  const actual = await vi.importActual<typeof import('@/ipc/commands.ts')>('@/ipc/commands.ts');
  return {...actual, resetApexToGameDefaults: mocks.resetApexToGameDefaults};
});

import {apexHistoryActions} from '@/stores/game/apex/actions_history.ts';
import type {ApexStoreThis} from '@/stores/game/apex/types.ts';

function resetStore() {
  return {
    active_apex_account: {
      kind: 'steam',
      user: {id: '1', name: 'Steam 1', avatar: '', config_path: 'localconfig.vdf'},
    },
    is_resetting_defaults: false,
    reset_defaults_dialog: true,
    launcher_selection_key: 'steam:1',
    video_config_request_generation: 0,
    game_settings_request_generation: 0,
    load_apex_video_config: vi.fn().mockResolvedValue(undefined),
    load_apex_game_settings: vi.fn().mockResolvedValue(undefined),
    load_config_history: vi.fn().mockResolvedValue(undefined),
  } as unknown as ApexStoreThis;
}

describe('Apex reset defaults notifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('describes a repeated reset as an informational no-op', async () => {
    mocks.resetApexToGameDefaults.mockRejectedValue({
      code: 'apex_history.operation_failed',
      message: 'apex.history.errors.noChanges',
    });
    const store = resetStore();

    await expect(apexHistoryActions.reset_apex_to_defaults.call(store)).resolves.toBe(true);

    expect(store.reset_defaults_dialog).toBe(false);
    expect(mocks.info).toHaveBeenCalledWith('apex.history.resetNoChanges');
    expect(mocks.error).not.toHaveBeenCalled();
    expect(store.is_resetting_defaults).toBe(false);
  });

  it('keeps actual reset failures as errors', async () => {
    mocks.resetApexToGameDefaults.mockRejectedValue({
      code: 'apex_history.write_failed',
      message: 'disk write failed',
    });
    const store = resetStore();

    await expect(apexHistoryActions.reset_apex_to_defaults.call(store)).resolves.toBe(false);

    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledOnce();
    expect(store.reset_defaults_dialog).toBe(true);
    expect(store.is_resetting_defaults).toBe(false);
  });

  it('reloads video and game settings after a successful reset', async () => {
    mocks.resetApexToGameDefaults.mockResolvedValue({
      historyEntry: {id: 'reset-1'},
      pendingScopes: [],
    });
    const store = resetStore();

    await expect(apexHistoryActions.reset_apex_to_defaults.call(store)).resolves.toBe(true);

    expect(store.reset_pending_scopes).toEqual([]);
    expect(store.load_apex_video_config).toHaveBeenCalledWith({silent: true, force: true});
    expect(store.load_apex_game_settings).toHaveBeenCalledWith({
      silent: true,
      force: true,
      discardLocal: true,
    });
    expect(store.load_config_history).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledWith('apex.history.resetSuccess');
    expect(store.is_resetting_defaults).toBe(false);
  });
});
