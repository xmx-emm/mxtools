import {defineStore} from 'pinia';
import type {SteamUser} from '@/types/steam.ts';
import {invoke} from '@tauri-apps/api/core';
import {useToast} from 'vue-toastification';

const toast = useToast();

const steamStore = defineStore('steam', {
  state: () => ({
    active_steam_user: <SteamUser | null>null,
    last_steam_user: <SteamUser | null>null,
    steam_users: <SteamUser[]>[],
    is_steam_running: false,
    is_refreshing_users: false,
  }),
  actions: {
    async refresh_users(options?: { silent?: boolean }) {
      if (this.is_refreshing_users) return;
      const silent = options?.silent ?? false;
      if (!silent) {
        this.is_refreshing_users = true;
      }
      try {
        return await invoke<SteamUser[]>('get_steam_users')
          .then((users) => {
            if ((this.last_steam_user === null || this.active_steam_user === null) && users.length !== 0) {
              this.last_steam_user = this.active_steam_user = users[0];
            }
            this.steam_users = users;
          }).catch((e) => {
            toast.error(e);
          });
      } finally {
        if (!silent) {
          this.is_refreshing_users = false;
        }
      }
    },
    set_active_steam_user(user: SteamUser) {
      this.last_steam_user = this.active_steam_user = user;
    },
    /** 查询 Steam 是否在运行(无缓存,每次调用均向后端发起检测) */
    async check_is_steam_running() {
      try {
        this.is_steam_running = await invoke<boolean>('steam_is_running_by_tasklist');
      } catch (e) {
        console.warn('check_is_steam_running failed', e);
      }
    },
  },
  tauri: { autoStart: true },
});
export default steamStore
