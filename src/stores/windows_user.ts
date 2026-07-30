import {defineStore} from 'pinia';
import {useToast} from 'vue-toastification';
import type {WindowsUser} from '@/types/windows.ts';
import {getWindowsUsers} from '@/ipc/commands.ts';

let latestLoadRequest = 0;

export const useWindowsUserStore = defineStore('windowsUser', {
  state: () => ({
    loading: false,
    users: <WindowsUser[]>[],
  }),
  actions: {
    async loadUsers() {
      const request = ++latestLoadRequest;
      this.loading = true;
      try {
        const users = await getWindowsUsers();
        if (request === latestLoadRequest) {
          this.users = users;
        }
      } catch (e) {
        if (request === latestLoadRequest) {
          console.error('loadUsers error', e);
          useToast().error(String(e) || 'rdp.user.empty');
        }
      } finally {
        if (request === latestLoadRequest) {
          this.loading = false;
        }
      }
    },
  },
});
