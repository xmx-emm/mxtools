import {defineStore} from 'pinia';
import {invoke} from '@tauri-apps/api/core';
import {EaDesktopUser} from '@/type.ts';
import {useToast} from 'vue-toastification';
import {useDebugStore} from '@/stores/debug';

const toast = useToast();
const debugStore = useDebugStore();

const eaStore = defineStore('ea', {
  state: () => ({
    ea_desktop_users: <EaDesktopUser[]>[],
    active_ea_user: <EaDesktopUser | null>null,
    /** EA Desktop / EA 客户端是否运行(写入 EA 启动项前需关闭) */
    is_ea_desktop_running: false,
  }),
  actions: {
    async refresh_users() {
      return invoke<EaDesktopUser[]>('get_ea_desktop_users')
        .then((users) => {
          // if (import.meta.env.DEV) {
          //   console.log('ea users', users);
          // }
          if (this.active_ea_user === null && users.length !== 0) {
            this.active_ea_user = users[0];
          }
          this.ea_desktop_users = users;
        })
        .catch((e) => {
          toast.error(e);
        });
    },
    set_active_ea_user(user: EaDesktopUser) {
      this.active_ea_user = user;
    },
    async check_is_ea_desktop_running() {
      const is_running = await invoke<boolean>('ea_desktop_is_running_by_tasklist');
      if (debugStore.game) {
        console.log('is_ea_desktop_running', is_running);
      }
      if (this.is_ea_desktop_running !== is_running) {
        this.is_ea_desktop_running = is_running;
      }
    },
  },
  tauri: { autoStart: true },
});
export default eaStore;
