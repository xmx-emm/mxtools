import {defineStore} from 'pinia';
import {
  DEFAULT_OVERLAY_HEIGHT,
  DEFAULT_OVERLAY_WIDTH,
  defaultApexQPrefs,
  normalizeApexQPrefs,
  type ApexQPrefs,
} from '@/types/apex_q.ts';

export const useApexQPreferencesStore = defineStore('apexQPreferences', {
  state: () => ({
    prefs: defaultApexQPrefs(),
  }),
  actions: {
    replace(prefs: ApexQPrefs) {
      this.prefs = normalizeApexQPrefs(prefs);
    },
  },
  tauri: {
    syncStrategy: 'debounce',
    syncInterval: 300,
    saveStrategy: 'debounce',
    saveInterval: 500,
  },
});

let fallbackPrefs = defaultApexQPrefs();
let activeStore: ReturnType<typeof useApexQPreferencesStore> | null = null;

export function bindApexQPreferencesStore(store: ReturnType<typeof useApexQPreferencesStore>) {
  activeStore = store;
}

export function loadApexQPrefs(): ApexQPrefs {
  return normalizeApexQPrefs(activeStore?.prefs ?? fallbackPrefs);
}

export function patchApexQPrefs(patch: Partial<ApexQPrefs>): ApexQPrefs {
  const next = normalizeApexQPrefs({...loadApexQPrefs(), ...patch});
  activeStore?.replace(next);
  fallbackPrefs = next;
  return next;
}

/**
 * Apply only the fields owned by the current operation. Auxiliary WebViews
 * retain fields received through Tauri events instead of writing a stale full
 * preference snapshot back over them.
 */
export function saveApexQPrefs(
  prefs: ApexQPrefs,
  changedKeys?: readonly (keyof ApexQPrefs)[],
) {
  const normalized = normalizeApexQPrefs(prefs);
  if (!changedKeys) return patchApexQPrefs(normalized);
  const patch = Object.fromEntries(changedKeys.map(key => [key, normalized[key]])) as Partial<ApexQPrefs>;
  return patchApexQPrefs(patch);
}

export function resetApexQOverlayGeometry(prefs: ApexQPrefs): ApexQPrefs {
  prefs.overlayX = null;
  prefs.overlayY = null;
  prefs.overlayW = DEFAULT_OVERLAY_WIDTH;
  prefs.overlayH = DEFAULT_OVERLAY_HEIGHT;
  prefs.overlayPlacement = null;
  saveApexQPrefs(prefs, [
    'overlayX',
    'overlayY',
    'overlayW',
    'overlayH',
    'overlayPlacement',
  ]);
  return prefs;
}
