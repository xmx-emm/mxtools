import {defineStore} from 'pinia';
import type {LocaleCode} from '@/utils/locale';

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    /** 下次启动时是否恢复上次关闭时的页面 */
    restoreLastRoute: true,
    /** 上次关闭时的完整路由路径(仅当 restoreLastRoute 为 true 时使用) */
    lastRoute: '' as string,
    /** 侧栏各工具分类下最后访问的子页 path(键：/game、/windows、/server) */
    lastToolCategoryChild: {} as Record<string, string>,
    /** 界面语言：system 表示跟随系统 */
    locale: 'system' as LocaleCode,
    /** Apex 启动项中用户已点击过的新特性 identifier,用于隐藏 NEW 角标 */
    apexNewItemsSeen: [] as string[],
    /** 已关闭的提示标签列表 */
    dismissedHintTags: [] as string[],
  }),
  actions: {
    markApexNewItemSeen(identifier: string) {
      if (identifier && !this.apexNewItemsSeen.includes(identifier)) {
        this.apexNewItemsSeen = [...this.apexNewItemsSeen, identifier];
      }
    },
    setRestoreLastRoute(v: boolean | null) {
      this.restoreLastRoute = v ?? false;
    },
    setLastRoute(path: string) {
      this.lastRoute = path;
    },
    recordToolCategoryLastChild(categoryPath: string, childPath: string) {
      this.lastToolCategoryChild = {
        ...this.lastToolCategoryChild,
        [categoryPath]: childPath,
      };
    },
    setLocale(locale: LocaleCode) {
      this.locale = locale;
    },
    addDismissedHintTag(tag: string) {
      if (!tag || this.dismissedHintTags.includes(tag)) return;
      this.dismissedHintTags = [...this.dismissedHintTags, tag];
    },
  },
  tauri: {},
});
