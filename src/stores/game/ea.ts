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
    /** 查询 EA Desktop 是否在运行(无缓存,每次调用均向后端发起检测) */
    async check_is_ea_desktop_running() {
      try {
        this.is_ea_desktop_running = await invoke<boolean>('ea_desktop_is_running_by_tasklist');
      } catch (e) {
        console.warn('check_is_ea_desktop_running failed', e);
      }
    },
  },
  tauri: { autoStart: true },
});
export default eaStore;
