import {defineStore} from 'pinia';
import {invoke} from '@tauri-apps/api/core';
import type {EaDesktopUser} from '@/types/ea.ts';
import {useToast} from 'vue-toastification';
import {
  type EaProfileCache,
  mergeEaUserProfile,
  updateEaProfileCache,
} from '@/utils/game/ea.ts';

const toast = useToast();

const EA_RUNNING_CHECK_CACHE_MS = import.meta.env.DEV ? 45000 : 12000;
let ea_running_check_cache: { at: number; value: boolean } | null = null;
let ea_running_check_in_flight: Promise<boolean> | null = null;

const eaStore = defineStore('ea', {
  state: () => ({
    ea_desktop_users: <EaDesktopUser[]>[],
    active_ea_user: <EaDesktopUser | null>null,
    /** 已获取的 EA 头像/昵称缓存，清 EA 日志后 refresh 时回填 */
    ea_profile_cache: <EaProfileCache>{},
    /** EA Desktop / EA 客户端是否运行(写入 EA 启动项前需关闭) */
    is_ea_desktop_running: false,
    is_refreshing_users: false,
  }),
  actions: {
    async refresh_users() {
      if (this.is_refreshing_users) return;
      this.is_refreshing_users = true;
      try {
        return await invoke<EaDesktopUser[]>('get_ea_desktop_users')
          .then((freshUsers) => {
          const cache = this.ea_profile_cache;
          for (const fresh of freshUsers) {
            updateEaProfileCache(cache, fresh);
          }
          const mergedUsers = freshUsers.map((fresh) =>
            mergeEaUserProfile(fresh, cache[fresh.id]),
          );
          this.ea_desktop_users = mergedUsers;

          if (this.active_ea_user === null && mergedUsers.length !== 0) {
            this.active_ea_user = mergedUsers[0];
          } else if (this.active_ea_user) {
            const active = mergedUsers.find((u) => u.id === this.active_ea_user!.id);
            if (active) {
              this.active_ea_user = active;
            }
          }
        })
        .catch((e) => {
          toast.error(e);
        });
      } finally {
        this.is_refreshing_users = false;
      }
    },
    set_active_ea_user(user: EaDesktopUser) {
      this.active_ea_user = user;
    },
    async check_is_ea_desktop_running(force = false) {
      const now = Date.now();
      if (
        !force
        && ea_running_check_cache
        && now - ea_running_check_cache.at < EA_RUNNING_CHECK_CACHE_MS
      ) {
        if (this.is_ea_desktop_running !== ea_running_check_cache.value) {
          this.is_ea_desktop_running = ea_running_check_cache.value;
        }
        return;
      }
      if (ea_running_check_in_flight) {
        const cached = await ea_running_check_in_flight;
        if (this.is_ea_desktop_running !== cached) {
          this.is_ea_desktop_running = cached;
        }
        return;
      }
      ea_running_check_in_flight = invoke<boolean>('ea_desktop_is_running_by_tasklist')
        .then((is_running) => {
          ea_running_check_cache = { at: Date.now(), value: is_running };
          return is_running;
        })
        .finally(() => {
          ea_running_check_in_flight = null;
        });
      const is_running = await ea_running_check_in_flight;
      if (this.is_ea_desktop_running !== is_running) {
        console.log('is_ea_desktop_running', is_running);
        this.is_ea_desktop_running = is_running;
      }
    },
  },
  tauri: { autoStart: true },
});
export default eaStore;
