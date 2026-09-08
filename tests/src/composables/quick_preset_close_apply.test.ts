import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';

const mocks = vi.hoisted(() => ({
  apexIsRunning: vi.fn(), steamIsRunningByTasklist: vi.fn(), eaDesktopIsRunningByTasklist: vi.fn(),
  thoroughlyKillApex: vi.fn(), thoroughlyKillSteam: vi.fn(), thoroughlyKillEaDesktop: vi.fn(),
  error: vi.fn(), cleanup: [] as (() => void)[],
}));
vi.mock('@/ipc/commands.ts', () => mocks);
vi.mock('vue-toastification', () => ({useToast: () => ({error: mocks.error})}));
vi.mock('vue', async () => ({
  ...await vi.importActual<typeof import('vue')>('vue'),
  onUnmounted: (callback: () => void) => mocks.cleanup.push(callback),
}));
import {detectRunningProcesses, useCloseLauncherThenApply} from '@/composables/useCloseLauncherThenApply.ts';

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  setActivePinia(createPinia());
  mocks.apexIsRunning.mockResolvedValue(false);
  mocks.steamIsRunningByTasklist.mockResolvedValue(false);
  mocks.eaDesktopIsRunningByTasklist.mockResolvedValue(false);
});
afterEach(() => {
  mocks.cleanup.splice(0).forEach(cleanup => cleanup());
  vi.useRealTimers();
});

function workflow(kind: 'steam' | 'ea' = 'steam', beforeApply = vi.fn().mockResolvedValue(true)) {
  const apply = vi.fn().mockResolvedValue(undefined);
  const coordinator = useCloseLauncherThenApply({
    apply, beforeApply, pollMs: 10, pollMaxMs: 100,
    resolveCloseProcesses: () => detectRunningProcesses(['apex', kind]),
  });
  return {...coordinator, apply};
}

describe('Quick preset process confirmation lifecycle', () => {
  it('applies directly when processes have exited', async () => {
    const flow = workflow();
    await flow.apply_check();
    expect(flow.apply).toHaveBeenCalledTimes(1);
    expect(flow.dialog.value).toBe(false);
    expect(flow.is_apply_running.value).toBe(false);
  });
  it('does not start when validation fails', async () => {
    const flow = workflow('steam', vi.fn().mockResolvedValue(false));
    await flow.apply_check();
    expect(flow.apply).not.toHaveBeenCalled();
    expect(mocks.apexIsRunning).not.toHaveBeenCalled();
  });
  it.each(['steam', 'ea'] as const)('waits for Apex and %s, then applies only once', async kind => {
    mocks.apexIsRunning.mockResolvedValue(true);
    const launcher = kind === 'steam' ? mocks.steamIsRunningByTasklist : mocks.eaDesktopIsRunningByTasklist;
    launcher.mockResolvedValue(true);
    const flow = workflow(kind);
    await flow.apply_check();
    await flow.apply_check();
    expect(flow.dialog.value).toBe(true);
    expect(flow.apply).not.toHaveBeenCalled();
    mocks.apexIsRunning.mockResolvedValue(false);
    await vi.advanceTimersByTimeAsync(10);
    expect(flow.apply).not.toHaveBeenCalled();
    launcher.mockResolvedValue(false);
    await vi.advanceTimersByTimeAsync(30);
    expect(flow.apply).toHaveBeenCalledTimes(1);
    expect(flow.is_apply_running.value).toBe(false);
  });
  it('cancels waiting without writing even after the process exits', async () => {
    mocks.apexIsRunning.mockResolvedValue(true);
    const flow = workflow();
    await flow.apply_check();
    flow.cancel();
    mocks.apexIsRunning.mockResolvedValue(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(flow.apply).not.toHaveBeenCalled();
  });
  it('verifies forced closure before applying', async () => {
    mocks.apexIsRunning.mockResolvedValue(true);
    const flow = workflow();
    await flow.apply_check();
    mocks.thoroughlyKillApex.mockImplementation(async () => mocks.apexIsRunning.mockResolvedValue(false));
    await flow.force_close_launcher();
    await vi.advanceTimersByTimeAsync(30);
    expect(mocks.thoroughlyKillApex).toHaveBeenCalledTimes(1);
    expect(flow.apply).toHaveBeenCalledTimes(1);
  });
  it('times out without writing and can be cancelled', async () => {
    mocks.apexIsRunning.mockResolvedValue(true);
    const flow = workflow();
    await flow.apply_check();
    await vi.advanceTimersByTimeAsync(120);
    expect(flow.apply).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith('toast.launcherCloseTimeout');
    expect(flow.is_apply_running.value).toBe(false);
    flow.cancel();
    expect(flow.dialog.value).toBe(false);
  });
});
