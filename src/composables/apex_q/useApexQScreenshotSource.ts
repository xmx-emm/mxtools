import {ref} from 'vue';
import type {ApexQSteamScreenshotDir} from '@/ipc/commands.ts';
import type {ApexQPrefs} from '@/types/apex_q.ts';

/** Owns Steam/manual screenshot-source selection state. */
export function useApexQScreenshotSource(prefs: ApexQPrefs) {
  const steamDirs = ref<ApexQSteamScreenshotDir[]>([]);
  const selectedSteamUserId = ref<string | null>(null);
  const folderMode = ref<'steam' | 'manual'>(
    prefs.screenshotFolder.trim() ? 'manual' : 'steam',
  );

  function folderKey(path: string) {
    return path.trim().replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
  }

  return {steamDirs, selectedSteamUserId, folderMode, folderKey};
}
