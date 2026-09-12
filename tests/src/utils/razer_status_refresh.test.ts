import {expect, it} from 'vitest';
import {createRazerStatusRefresh} from '@/utils/razer_status_refresh.ts';
import type {RazerPollingStatus} from '@/types/razer_polling.ts';

it('keeps a foreground-event status when an older device probe finishes later', async () => {
  let finishProbe!: (statuses: RazerPollingStatus[]) => void;
  const probe = () => new Promise<RazerPollingStatus[]>(resolve => { finishProbe = resolve; });
  let current: RazerPollingStatus[] = [];
  const refresh = createRazerStatusRefresh(probe, statuses => { current = statuses; });
  const pending = refresh.refresh();
  const foreground = [{activeProfileId: 'apex', currentRateHz: 8000}] as RazerPollingStatus[];
  refresh.onEvent(foreground);
  finishProbe([{activeProfileId: null, currentRateHz: 500}] as RazerPollingStatus[]);

  expect(await pending).toBe(false);
  expect(current).toBe(foreground);
});

it('applies a probe when no newer foreground event arrived', async () => {
  let current: RazerPollingStatus[] = [];
  const discovered = [{activeProfileId: null, currentRateHz: 500}] as RazerPollingStatus[];
  const refresh = createRazerStatusRefresh(async () => discovered, statuses => { current = statuses; });

  expect(await refresh.refresh()).toBe(true);
  expect(current).toBe(discovered);
});
