import {ref} from 'vue';
import type {AlterQSteamScreenshotDir} from '@/ipc/commands.ts';
import type {AlterQPrefs} from '@/types/alter_q.ts';

/** Owns Steam/manual screenshot-source selection state. */
export function useAlterQScreenshotSource(prefs: AlterQPrefs) {
  const steamDirs = ref<AlterQSteamScreenshotDir[]>([]);
  const selectedSteamUserId = ref<string | null>(null);
  const folderMode = ref<'steam' | 'manual'>(
    prefs.screenshotFolder.trim() ? 'manual' : 'steam',
  );

  function folderKey(path: string) {
    return path.trim().replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
  }

  return {steamDirs, selectedSteamUserId, folderMode, folderKey};
}
