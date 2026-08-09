import {defineStore} from 'pinia';
import {listen} from '@tauri-apps/api/event';
import {
  configureBackgroundRuntime,
  getBackgroundRuntime,
  setBackgroundRuntimeAutostart,
  setBackgroundRuntimeBetaFeatures,
  setBackgroundRuntimeLocale,
  updateBackgroundRuntimeApexQ,
  updateBackgroundRuntimeRazer,
} from '@/ipc/commands.ts';
import type {
  BackgroundRuntimeConfig,
  BackgroundRuntimeSnapshot,
  RazerBackgroundConfig,
} from '@/types/background_runtime.ts';

export type BackgroundAutostartStatus = 'loading' | 'unsupported' | 'enabled' | 'disabled' | 'mismatch';

export const BACKGROUND_RUNTIME_CHANGED_EVENT = 'background-runtime-changed';
const eventSyncByStore = new WeakMap<object, Promise<void>>();

function hasTauriRuntime() {
  return typeof window !== 'undefined'
    && Boolean((window as Window & {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__);
}

export const useBackgroundRuntimeStore = defineStore('background-runtime', {
  state: () => ({
    snapshot: null as BackgroundRuntimeSnapshot | null,
    loading: false,
    applyingAutostart: false,
    eventSyncStarted: false,
    eventVersion: 0,
    error: '' as string,
  }),
  getters: {
    autostartSupported: state => state.snapshot?.autostartSupported ?? false,
    autostartEnabled: state => state.snapshot?.autostartEnabled ?? false,
    autostartStatus: (state): BackgroundAutostartStatus => {
      const snapshot = state.snapshot;
      if (!snapshot) return 'loading';
      if (!snapshot.autostartSupported) return 'unsupported';
      if (snapshot.configuredAutostart !== snapshot.autostartEnabled) return 'mismatch';
      return snapshot.autostartEnabled ? 'enabled' : 'disabled';
    },
    backgroundLaunchMode: state => state.snapshot?.launchMode ?? null,
  },
  actions: {
    async startEventSync() {
      if (!hasTauriRuntime() || this.eventSyncStarted) return;
      const store = this as object;
      let eventSync = eventSyncByStore.get(store);
      if (!eventSync) {
        eventSync = listen<BackgroundRuntimeSnapshot>(BACKGROUND_RUNTIME_CHANGED_EVENT, ({payload}) => {
          this.eventVersion += 1;
          this.snapshot = payload;
        }).then(() => undefined);
        eventSyncByStore.set(store, eventSync);
      }
      try {
        await eventSync;
        this.eventSyncStarted = true;
      } catch (error) {
        eventSyncByStore.delete(store);
        this.eventSyncStarted = false;
        throw error;
      }
    },
    async refresh() {
      if (!hasTauriRuntime() || this.loading) return this.snapshot;
      this.loading = true;
      this.error = '';
      try {
        await this.startEventSync();
        const eventVersion = this.eventVersion;
        const snapshot = await getBackgroundRuntime();
        if (this.eventVersion === eventVersion) this.snapshot = snapshot;
        return this.snapshot;
      } catch (error) {
        this.error = String(error);
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async setAutostart(enabled: boolean | null) {
      if (!hasTauriRuntime() || this.applyingAutostart) return;
      this.applyingAutostart = true;
      this.error = '';
      try {
        await this.startEventSync();
        const eventVersion = this.eventVersion;
        const snapshot = await setBackgroundRuntimeAutostart(enabled ?? false);
        if (this.eventVersion === eventVersion) this.snapshot = snapshot;
      } catch (error) {
        this.error = String(error);
        throw error;
      } finally {
        this.applyingAutostart = false;
      }
    },
    async configure(config: BackgroundRuntimeSnapshot['config']) {
      if (!hasTauriRuntime()) return;
      await this.startEventSync();
      const eventVersion = this.eventVersion;
      const snapshot = await configureBackgroundRuntime(config);
      if (this.eventVersion === eventVersion) this.snapshot = snapshot;
      return this.snapshot;
    },
    async configureApexQ(apexQ: BackgroundRuntimeConfig['apexQ']) {
      if (!hasTauriRuntime()) return this.snapshot;
      await this.startEventSync();
      const eventVersion = this.eventVersion;
      const snapshot = await updateBackgroundRuntimeApexQ(apexQ);
      if (this.eventVersion === eventVersion) this.snapshot = snapshot;
      return this.snapshot;
    },
    async setBetaFeatures(enabled: boolean) {
      if (!hasTauriRuntime()) return this.snapshot;
      await this.startEventSync();
      const eventVersion = this.eventVersion;
      const snapshot = await setBackgroundRuntimeBetaFeatures(enabled);
      if (this.eventVersion === eventVersion) this.snapshot = snapshot;
      return this.snapshot;
    },
    async configureRazer(razer: RazerBackgroundConfig) {
      if (!hasTauriRuntime()) return null;
      await this.startEventSync();
      const eventVersion = this.eventVersion;
      const result = await updateBackgroundRuntimeRazer(razer);
      if (this.eventVersion === eventVersion) this.snapshot = result.snapshot;
      return result;
    },
    async setLocale(locale: BackgroundRuntimeConfig['locale']) {
      if (!hasTauriRuntime()) return this.snapshot;
      await this.startEventSync();
      const eventVersion = this.eventVersion;
      const snapshot = await setBackgroundRuntimeLocale(locale);
      if (this.eventVersion === eventVersion) this.snapshot = snapshot;
      return this.snapshot;
    },
  },
});
