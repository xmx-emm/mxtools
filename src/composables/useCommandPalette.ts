import {readonly, ref} from 'vue';

const RECENT_PATHS_STORAGE_KEY = 'mxtools.command-palette.recent-paths.v1';
const MAX_RECENT_PATHS = 8;

function normalizePath(path: string): string {
  return (path.split(/[?#]/)[0] ?? '').trim();
}

function loadRecentPaths(): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = JSON.parse(window.localStorage.getItem(RECENT_PATHS_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((path): path is string => typeof path === 'string')
      .map(normalizePath)
      .filter((path, index, paths) => path !== '' && paths.indexOf(path) === index)
      .slice(0, MAX_RECENT_PATHS);
  } catch {
    return [];
  }
}

const isOpenState = ref(false);
const recentPathsState = ref<string[]>(loadRecentPaths());

function persistRecentPaths() {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      RECENT_PATHS_STORAGE_KEY,
      JSON.stringify(recentPathsState.value),
    );
  } catch {
    // The command palette still works when local storage is unavailable.
  }
}

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
  persistRecentPaths();
}

/** Shared state so the app shell and any command trigger control one palette instance. */
export function useCommandPalette() {
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
