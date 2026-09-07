import {beforeEach, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import {useDownloadsStore} from '@/stores/downloads.ts';
import {apexMilesActions} from '@/stores/game/apex/actions_miles.ts';
import type {ApexStoreThis} from '@/stores/game/apex/types.ts';
vi.mock('@tauri-apps/api/core', () => ({isTauri: () => false, invoke: vi.fn()}));
beforeEach(() => setActivePinia(createPinia()));

it('pins the selected EA account to the queued download', async () => {
  const downloads = useDownloadsStore();
  const enqueue = vi.spyOn(downloads, 'enqueue').mockResolvedValue(42);
  const account = {active_apex_account: {kind: 'ea', user: {id: 'ea-user-2'}}, language: 'japanese', miles_download_job_id: null} as unknown as ApexStoreThis;
  await apexMilesActions.start_miles_auto_download_ea.call(account);
  expect(enqueue).toHaveBeenCalledWith('ea', 'japanese', 'ea-user-2');
  expect(account.miles_download_job_id).toBe(42);
});

it('does not resume another EA account task', async () => {
  const downloads = useDownloadsStore();
  downloads.jobs = [{id: 1, platform: 'ea', language: 'japanese', status: 'paused', eaUserId: 'ea-user-1'}] as typeof downloads.jobs;
  const enqueue = vi.spyOn(downloads, 'enqueue').mockResolvedValue(2);
  const control = vi.spyOn(downloads, 'control').mockResolvedValue();
  const account = {active_apex_account: {kind: 'ea', user: {id: 'ea-user-2'}}, language: 'japanese', miles_download_job_id: 1} as unknown as ApexStoreThis;
  await apexMilesActions.start_miles_auto_download_ea.call(account);
  expect(control).not.toHaveBeenCalled();
  expect(enqueue).toHaveBeenCalledWith('ea', 'japanese', 'ea-user-2');
});
