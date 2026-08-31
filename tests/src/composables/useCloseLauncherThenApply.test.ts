import {beforeEach, describe, expect, it, vi} from 'vitest';

const ipc = vi.hoisted(() => ({
  apexIsRunning: vi.fn(),
  steamIsRunningByTasklist: vi.fn(),
  eaDesktopIsRunningByTasklist: vi.fn(),
  thoroughlyKillApex: vi.fn(),
  thoroughlyKillSteam: vi.fn(),
  thoroughlyKillEaDesktop: vi.fn(),
}));

vi.mock('@/ipc/commands.ts', () => ({
  ...ipc,
}));

import {
  detectRunningProcesses,
  forceCloseProcesses,
} from '@/composables/useCloseLauncherThenApply.ts';

describe('close-running-process detection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports Apex and Steam together when both are running', async () => {
    ipc.apexIsRunning.mockResolvedValue(true);
    ipc.steamIsRunningByTasklist.mockResolvedValue(true);

    await expect(detectRunningProcesses(['apex', 'steam']))
      .resolves.toEqual(['apex', 'steam']);
  });

  it('returns only processes that still need to close', async () => {
    ipc.apexIsRunning.mockResolvedValue(false);
    ipc.eaDesktopIsRunningByTasklist.mockResolvedValue(true);

    await expect(detectRunningProcesses(['apex', 'ea', 'ea']))
      .resolves.toEqual(['ea']);
    expect(ipc.eaDesktopIsRunningByTasklist).toHaveBeenCalledTimes(1);
  });

  it('force closes every displayed process together', async () => {
    await forceCloseProcesses(['apex', 'steam', 'apex']);

    expect(ipc.thoroughlyKillApex).toHaveBeenCalledTimes(1);
    expect(ipc.thoroughlyKillSteam).toHaveBeenCalledTimes(1);
    expect(ipc.thoroughlyKillEaDesktop).not.toHaveBeenCalled();
  });
});
