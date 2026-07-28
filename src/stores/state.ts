import {defineStore} from 'pinia';
import {checkBackupsExplorerRegistry, isElevated} from '@/ipc/commands.ts';

export const useStateStore = defineStore('state', {
    state: () => ({
      is_elevated: false,
      explorer_registry_is_backups_ok: false
    }),
    getters: {},
    actions: {
      async updateState() {
        this.is_elevated = await isElevated();
        await this.updateExplorerBackups();
      },
      async updateExplorerBackups() {
        this.explorer_registry_is_backups_ok = await checkBackupsExplorerRegistry();
      }
    }
  }
);
