import {defineStore} from 'pinia';
import {useToast} from 'vue-toastification';
import type {Ipv, PortForwarding} from '@/types/network.ts';
import {getPortForwarding} from '@/ipc/commands.ts';

export const usePortForwardingStore = defineStore('portForwarding', {
  state: () => ({
    loading: false,
    list: [] as PortForwarding[],
  }),
  actions: {
    async update() {
      this.loading = true;
      try {
        this.list = await getPortForwarding();
      } catch (err) {
        console.warn('get_port_forwarding failed', err);
        useToast().error(
          err instanceof Error ? err.message : String(err ?? 'portForwarding.errors.loadFailed'),
        );
        // 查询失败时不要假装「当前无规则」
        throw err;
      } finally {
        this.loading = false;
      }
    },
    default(): PortForwarding {
      const ipvA: Ipv = {
        address: '127.0.0.1',
        port: 100,
      };
      const ipvB: Ipv = {
        address: '127.0.0.1',
        port: 100,
      };
      return {
        listen: ipvA,
        connect: ipvB,
      };
    },
  },
});
