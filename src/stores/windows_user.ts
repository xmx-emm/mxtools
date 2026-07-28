import {defineStore} from 'pinia';
import {useToast} from 'vue-toastification';
import type {WindowsUser} from '@/types/windows.ts';
import {getWindowsUsers} from '@/ipc/commands.ts';

export const useWindowsUserStore = defineStore('windowsUser', {
  state: () => ({
    loading: false,
    users: <WindowsUser[]>[],
  }),
  actions: {
    async loadUsers() {
      this.loading = true;
      try {
        this.users = await getWindowsUsers();
      } catch (e) {
        console.error('loadUsers error', e);
        useToast().error(String(e) || 'rdp.user.empty');
      }
      this.loading = false;
    },
  },
});
