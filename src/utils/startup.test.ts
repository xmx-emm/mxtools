import {describe, expect, it, vi} from 'vitest';
import {settleStartupTask} from '@/utils/startup.ts';

describe('startup resilience', () => {
  it('settles a stuck native task after the one-shot startup timeout', async () => {
    vi.useFakeTimers();
    const pending = settleStartupTask(() => new Promise<void>(() => undefined), 25);

    await vi.advanceTimersByTimeAsync(25);

    await expect(pending).resolves.toMatchObject({ok: false, error: expect.any(Error)});
    vi.useRealTimers();
  });
});
