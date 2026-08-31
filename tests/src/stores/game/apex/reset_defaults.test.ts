import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  resetApexToGameDefaults: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    info: mocks.info,
    error: mocks.error,
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
});
