import {defineStore} from 'pinia';
import type {SteamUser} from '@/types/steam.ts';
import {invoke} from '@tauri-apps/api/core';
import {useToast} from 'vue-toastification';
import {useDebugStore} from '@/stores/debug';

const toast = useToast();
const debugStore = useDebugStore();

const STEAM_RUNNING_CHECK_CACHE_MS = import.meta.env.DEV ? 45000 : 12000;
let steam_running_check_cache: { at: number; value: boolean } | null = null;
let steam_running_check_in_flight: Promise<boolean> | null = null;

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
    async check_is_steam_running(force = false) {
      const now = Date.now();
      if (
        !force
        && steam_running_check_cache
        && now - steam_running_check_cache.at < STEAM_RUNNING_CHECK_CACHE_MS
      ) {
        if (this.is_steam_running !== steam_running_check_cache.value) {
          this.is_steam_running = steam_running_check_cache.value;
        }
        return;
      }
      if (steam_running_check_in_flight) {
        const cached = await steam_running_check_in_flight;
        if (this.is_steam_running !== cached) {
          this.is_steam_running = cached;
        }
        return;
      }
      steam_running_check_in_flight = invoke<boolean>('steam_is_running_by_tasklist')
        .then((is_running) => {
          steam_running_check_cache = { at: Date.now(), value: is_running };
          return is_running;
        })
        .finally(() => {
          steam_running_check_in_flight = null;
        });
      const is_running = await steam_running_check_in_flight;
      if (debugStore.game && this.is_steam_running !== is_running) {
        console.log('is_steam_running', is_running);
      }
      if (this.is_steam_running !== is_running) {
        this.is_steam_running = is_running;
      }
    },
  },
  tauri: { autoStart: true },
});
export default steamStore
