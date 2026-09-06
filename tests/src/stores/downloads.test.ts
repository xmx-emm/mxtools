import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import {useDownloadsStore} from '@/stores/downloads.ts';
import {useApexStore} from '@/stores/game/apex.ts';
import type {DownloadJob} from '@/ipc/commands.ts';
import {apexMilesActions} from '@/stores/game/apex/actions_miles.ts';
import type {ApexStoreThis} from '@/stores/game/apex/types.ts';

vi.mock('@tauri-apps/api/core', () => ({isTauri: () => false, invoke: vi.fn()}));
beforeEach(() => setActivePinia(createPinia()));
const job: DownloadJob = {
  id: 1, platform: 'steam', language: 'japanese', depot: 1172477,
  status: 'done', requested: null, createdAt: '', updatedAt: '',
  progress: {phase: 'done', depot: 1172477, percent: 100, downloadedBytes: 0, totalBytes: 0, message: '', cefBrowser: ''},
};
describe('Native download queue snapshots', () => {
  it('rejects stale refresh responses after a newer event', () => {
    const store = useDownloadsStore();
    store.adopt({revision: 3, jobs: [job]});
    store.adopt({revision: 2, jobs: []});
    expect(store.jobs).toEqual([job]);
  });
  it('does not reuse completed history as present file state', async () => {
    const downloads = useDownloadsStore();
    downloads.adopt({revision: 1, jobs: [job]});
    const store = {
      active_account_is_ea: false, language: 'japanese', launcher_selection_key: 'steam:1',
      miles_download_progress: job.progress, miles_download_job_id: 1,
      check_miles_language: vi.fn().mockResolvedValue(false),
    } as unknown as ApexStoreThis;
    await apexMilesActions.open_miles_auto_download.call(store);
    expect(store.miles_download_job_id).toBeNull();
    expect(store.miles_download_progress).toBeNull();
    expect(store.is_miles_language_ready).toBe(false);
    expect(store.check_miles_language).toHaveBeenCalledWith(true);
  });
  it('restores only a matching unfinished task', async () => {
    useApexStore();
    useDownloadsStore().adopt({revision: 1, jobs: [{...job, status: 'paused'}]});
    const store = {
      active_account_is_ea: false, language: 'japanese', launcher_selection_key: 'steam:1',
      check_miles_language: vi.fn().mockResolvedValue(false),
    } as unknown as ApexStoreThis;
    await apexMilesActions.open_miles_auto_download.call(store);
    expect(store.miles_download_job_id).toBe(1);
  });
});
