import {defineStore} from 'pinia';
import {invoke} from '@tauri-apps/api/core';
import {Ipv, PortForwarding} from '@/type.ts';

export const usePortForwardingStore = defineStore('usePortForwardingStore', {
    state: () => ({
      loading: true,
      list: <PortForwarding[]>[],
    }),
    getters: {},
    actions: {
      async update() {
        this.loading = true;
        this.list = await invoke('get_port_forwarding');
        this.loading = false;
      },
      default(): PortForwarding {
        const ipvA: Ipv = {
          address: '127.0.0.1',
          port: 100
        };
        const ipvB: Ipv = {
          address: '127.0.0.1',
          port: 100
        };
        return {
          listen: ipvA,
          connect: ipvB,
        };
      }
    },
    persist: false,
  }
);
