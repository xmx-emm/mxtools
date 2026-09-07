import {defineStore} from 'pinia';
import {listen} from '@tauri-apps/api/event';
import {isTauri} from '@tauri-apps/api/core';
import {useSettingsStore} from '@/stores/settings.ts';
import {ipcInvoke} from '@/ipc/commands.ts';

export interface UpdateInfo {
  currentVersion: string;
  version: string | null;
  notes: string | null;
  availability: 'ready' | 'manual' | 'store' | 'unconfigured';
}
let listeners: Promise<void> | null = null;
const cleanup: Array<() => void> = [];
export const useAppUpdateStore = defineStore('app-update', {
  state: () => ({
    phase: 'idle' as 'idle' | 'checking' | 'available' | 'latest' | 'downloading' | 'installing' | 'error',
    info: null as UpdateInfo | null, error: '', downloaded: 0, total: null as number | null,
  }),
  getters: {
    busy: state => ['checking', 'downloading', 'installing'].includes(state.phase),
    percent: state => state.total && state.total > 0 ? Math.min(100, state.downloaded / state.total * 100) : null,
  },
  actions: {
    async initialize() {
      if (!isTauri()) return;
      if (!listeners) listeners = (async () => {
        cleanup.push(await listen<{downloaded: number; total: number | null}>('app-update-progress', event => {
          this.downloaded = event.payload.downloaded;
          this.total = event.payload.total;
        }));
        cleanup.push(await listen('app-update-installing', () => { this.phase = 'installing'; }));
      })();
      await listeners;
    },
    async check() {
      if (!isTauri() || this.busy) return;
      this.phase = 'checking';
      this.error = '';
      try {
        await this.initialize();
        this.info = await ipcInvoke<UpdateInfo>('check_app_update');
        this.phase = this.info.version ? 'available' : this.info.availability === 'ready' ? 'latest' : 'idle';
      } catch (error) { this.error = error instanceof Error ? error.message : String(error); this.phase = 'error'; }
    },
    async autoCheck() {
      const settings = useSettingsStore();
      if (!settings.autoCheckUpdates || Date.now() - settings.lastAutoUpdateCheck < 24 * 60 * 60 * 1000) return;
      await this.check();
      if (this.phase !== 'error') settings.lastAutoUpdateCheck = Date.now();
    },
    async install() {
      if (!this.info?.version || this.busy) return;
      this.phase = 'downloading';
      this.error = '';
      this.downloaded = 0;
      this.total = null;
      try { await ipcInvoke<void>('install_app_update', {version: this.info.version}); }
      catch (error) { this.error = error instanceof Error ? error.message : String(error); this.phase = 'error'; }
    },
  },
});
if (import.meta.hot) import.meta.hot.dispose(() => { cleanup.splice(0).forEach(fn => fn()); listeners = null; });
