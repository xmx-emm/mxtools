import {readonly, ref} from 'vue';
import {useSettingsStore} from '@/stores/settings.ts';

const MAX_RECENT_PATHS = 8;

function normalizePath(path: string): string {
  return (path.split(/[?#]/)[0] ?? '').trim();
}

const isOpenState = ref(false);
const recentPathsState = ref<string[]>([]);
let settingsStore: ReturnType<typeof useSettingsStore> | null = null;

export function openCommandPalette() {
  isOpenState.value = true;
}

export function closeCommandPalette() {
  isOpenState.value = false;
}

export function toggleCommandPalette() {
  isOpenState.value = !isOpenState.value;
}

export function recordCommandPalettePath(path: string) {
  const normalized = normalizePath(path);
  if (!normalized) return;

  recentPathsState.value = [
    normalized,
    ...recentPathsState.value.filter((recentPath) => recentPath !== normalized),
  ].slice(0, MAX_RECENT_PATHS);
  if (settingsStore) settingsStore.commandPaletteRecentPaths = [...recentPathsState.value];
}

/** Shared state so the app shell and any command trigger control one palette instance. */
export function useCommandPalette() {
  settingsStore ??= useSettingsStore();
  recentPathsState.value = [...settingsStore.commandPaletteRecentPaths]
    .map(normalizePath)
    .filter((path, index, paths) => path !== '' && paths.indexOf(path) === index)
    .slice(0, MAX_RECENT_PATHS);
  return {
    isOpen: readonly(isOpenState),
    recentPaths: readonly(recentPathsState),
    open: openCommandPalette,
    close: closeCommandPalette,
    toggle: toggleCommandPalette,
    openCommandPalette,
    closeCommandPalette,
    toggleCommandPalette,
    recordRecentPath: recordCommandPalettePath,
  };
}
