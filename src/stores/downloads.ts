import {defineStore} from 'pinia';
import {isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {
  DOWNLOAD_MANAGER_EVENT, getDownloadQueue, enqueueApexDownload,
  controlDownload, clearFinishedDownloads,
  type DownloadJob, type DownloadSnapshot,
} from '@/ipc/commands.ts';

export function isFinishedDownload(status: string): boolean {
  return ['done', 'error', 'cancelled'].includes(status);
}
let initialization: Promise<void> | null = null;
let unsubscribe: (() => void) | null = null;

export const useDownloadsStore = defineStore('downloads', {
  // Native queue is authoritative. Do not persist transient queue events.
  state: () => ({revision: -1, jobs: [] as DownloadJob[], error: '', loading: false}),
  getters: {
    unfinished: state => state.jobs.filter(job => !isFinishedDownload(job.status)).length,
  },
  actions: {
    adopt(snapshot: DownloadSnapshot) {
      if (snapshot.revision < this.revision) return;
      this.revision = snapshot.revision;
      this.jobs = snapshot.jobs;
    },
    async refresh() {
      if (!isTauri()) return;
      this.loading = true;
      try { this.adopt(await getDownloadQueue()); this.error = ''; }
      catch (error) { this.error = error instanceof Error ? error.message : String(error); }
      finally { this.loading = false; }
    },
    async initialize() {
      if (!isTauri()) return;
      if (!initialization) {
        initialization = (async () => {
          unsubscribe = await listen<DownloadSnapshot>(DOWNLOAD_MANAGER_EVENT, event => this.adopt(event.payload));
          await this.refresh();
        })().catch(error => { initialization = null; throw error; });
      }
      await initialization;
    },
    async enqueue(platform: 'steam' | 'ea', language: string, eaUserId: string | null = null) {
      await this.initialize();
      const id = await enqueueApexDownload({platform, language, eaUserId});
      await this.refresh();
      return id;
    },
    async control(id: number, action: 'pause' | 'resume' | 'retry' | 'cancel') {
      await controlDownload({id, action});
      await this.refresh();
    },
    async clearFinished() { await clearFinishedDownloads(); await this.refresh(); },
  },
});

if (import.meta.hot) import.meta.hot.dispose(() => {
  unsubscribe?.();
  unsubscribe = null;
  initialization = null;
});
