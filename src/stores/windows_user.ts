import {defineStore} from 'pinia';
import {invoke} from '@tauri-apps/api/core';
import type {WindowsUser} from '@/types/windows.ts';

export const useWindowsUserStore = defineStore('windowsUser', {
  state: () => ({
    loading: false,
    users: <WindowsUser[]>[],
  }),
  actions: {
    async loadUsers() {
      this.loading = true;
      try {
        this.users = await invoke('get_windows_users');
      } catch (e) {
        console.error('loadUsers error', e);
      }
      this.loading = false;
    },
  },
});
