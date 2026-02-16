import { defineStore } from 'pinia';
import type { LocaleCode } from '@/utils/locale';

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    /** 下次启动时是否恢复上次关闭时的页面 */
    restoreLastRoute: false,
    /** 上次关闭时的完整路由路径（仅当 restoreLastRoute 为 true 时使用） */
    lastRoute: '' as string,
    /** 界面语言：system 表示跟随系统 */
    locale: 'system' as LocaleCode,
  }),
  actions: {
    setRestoreLastRoute(v: boolean) {
      this.restoreLastRoute = v;
    },
    setLastRoute(path: string) {
      this.lastRoute = path;
    },
    setLocale(locale: LocaleCode) {
      this.locale = locale;
    },
  },
  persist: true,
});
