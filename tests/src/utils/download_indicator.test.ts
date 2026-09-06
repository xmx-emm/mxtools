import {describe, expect, it} from 'vitest';
import type {DownloadJob} from '@/ipc/commands.ts';
import {downloadIndicator} from '@/utils/download_indicator.ts';

const job = (status: string, percent = 0, progressKnown = false) => ({
  status, progress: {percent, progressKnown},
}) as DownloadJob;
describe('Download navigation status', () => {
  it('prioritizes a running task over history and paused jobs', () => {
    expect(downloadIndicator([job('error'), job('paused'), job('downloading', 42, true)]))
      .toEqual({state: 'active', percent: 42});
  });
  it('shows indeterminate activity for unknown bytes and preparation', () => {
    expect(downloadIndicator([job('downloading', 99)])).toEqual({state: 'active', percent: null});
    expect(downloadIndicator([job('applying', 99, true)])).toEqual({state: 'active', percent: null});
    expect(downloadIndicator([job('downloading', NaN, true)])).toEqual({state: 'active', percent: null});
  });
  it('distinguishes queued, paused, failed and idle states', () => {
    expect(downloadIndicator([job('queued')]).state).toBe('queued');
    expect(downloadIndicator([job('paused')]).state).toBe('paused');
    expect(downloadIndicator([job('error')]).state).toBe('error');
    expect(downloadIndicator([job('done')]).state).toBe('idle');
    expect(downloadIndicator([]).state).toBe('idle');
  });
});
