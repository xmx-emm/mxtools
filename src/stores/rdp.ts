import {defineStore} from 'pinia';
import type {RdpConnection} from '@/types/rdp.ts';
import {useWindowsUserStore} from '@/stores/windows_user.ts';
import {
  getRdpEnabled,
  getRdpPort,
  loadRdpConnections,
  saveRdpConnections,
} from '@/ipc/commands.ts';

export const useRdpStore = defineStore('rdp', {
  state: () => ({
    loading: false,
    initialized: false,
    rdpEnabled: false,
    rdpPort: 3389 as number,
    connections: <RdpConnection[]>[],
  }),
  actions: {
    async loadRdpStatus() {
      try {
        this.rdpEnabled = await getRdpEnabled();
      } catch (e) {
        console.error('loadRdpStatus error', e);
      }
    },
    async loadRdpPort() {
      try {
        this.rdpPort = await getRdpPort();
      } catch (e) {
        console.error('loadRdpPort error', e);
      }
    },
    async loadConnections() {
      try {
        this.connections = await loadRdpConnections();
      } catch (e) {
        console.error('loadConnections error', e);
      }
    },
    async saveConnections() {
      await saveRdpConnections({connections: this.connections});
    },
    async loadAll() {
      if (this.loading) return;
      this.loading = true;
      try {
        const userStore = useWindowsUserStore();
        await Promise.all([
          userStore.loadUsers(),
          this.loadRdpStatus(),
          this.loadRdpPort(),
          this.loadConnections(),
        ]);
      } finally {
        this.loading = false;
        this.initialized = true;
      }
    },
  },
});
