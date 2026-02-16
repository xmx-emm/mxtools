import {defineStore} from 'pinia';
import {invoke} from '@tauri-apps/api/core';

export const useStateStore = defineStore('state', {
    state: () => ({
      is_elevated: false,
      explorer_registry_is_backups_ok: false
    }),
    getters: {},
    actions: {
      async updateState() {
        this.is_elevated = await invoke('is_elevated');
        await this.updateExplorerBackups();
      },
      async updateExplorerBackups() {
        this.explorer_registry_is_backups_ok = await invoke('check_backups_explorer_registry');
      }
    }
  }
);
