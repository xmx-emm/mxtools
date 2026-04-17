import {defineStore} from 'pinia';
import {invoke} from '@tauri-apps/api/core';
import type {RdpConnection} from '@/type.ts';
import {useWindowsUserStore} from '@/stores/windows_user.ts';

export const useRdpStore = defineStore('rdp', {
  state: () => ({
    loading: false,
    rdpEnabled: false,
    rdpPort: 3389 as number,
    connections: <RdpConnection[]>[],
  }),
  actions: {
    async loadRdpStatus() {
      try {
        this.rdpEnabled = await invoke('get_rdp_enabled');
      } catch (e) {
        console.error('loadRdpStatus error', e);
      }
    },
    async loadRdpPort() {
      try {
        this.rdpPort = await invoke('get_rdp_port');
      } catch (e) {
        console.error('loadRdpPort error', e);
      }
    },
    async loadConnections() {
      try {
        this.connections = await invoke('load_rdp_connections');
      } catch (e) {
        console.error('loadConnections error', e);
      }
    },
    async saveConnections() {
      try {
        await invoke('save_rdp_connections', { connections: this.connections });
      } catch (e) {
        console.error('saveConnections error', e);
      }
    },
    async loadAll() {
      this.loading = true;
      const userStore = useWindowsUserStore();
      await Promise.all([
        userStore.loadUsers(),
        this.loadRdpStatus(),
        this.loadRdpPort(),
        this.loadConnections(),
      ]);
      this.loading = false;
    },
  },
});
