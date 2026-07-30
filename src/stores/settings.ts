import {defineStore} from 'pinia';
import type {LocaleCode} from '@/utils/locale.ts';
import {
  clampNavPrimaryWidth,
  clampNavSecondaryWidth,
  NAV_MIN_WIDTH,
  NAV_PRIMARY_MAX,
  NAV_SECONDARY_MAX,
} from '@/constants/nav_layout.ts';
import {
  applyWindowBehavior,
  loadWindowBehaviorPrefs,
  migrateApexQWindowBehaviorIfNeeded,
  type WindowBehaviorPrefs,
} from '@/utils/window_behavior.ts';

export const DEFAULT_TOGGLE_LOCALE_SHORTCUT = 'Ctrl+Alt+Z';

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
    /** 一级导航栏宽度(px) */
    navPrimaryWidth: NAV_MIN_WIDTH,
    /** 二级导航栏宽度(px) */
    navSecondaryWidth: NAV_MIN_WIDTH,
    /** 切换界面语言的应用内快捷键（仅窗口聚焦时生效） */
    toggleLocaleShortcut: DEFAULT_TOGGLE_LOCALE_SHORTCUT,
    /** 是否启用「切换界面语言」快捷键 */
    toggleLocaleShortcutEnabled: true,
    /** 是否显示并启用仍在测试中的功能 */
    betaFeaturesEnabled: false,
    /** 开机自启 */
    autostart: false,
    /** 关闭窗口时最小化到托盘（否则退出） */
    closeToTray: false,
    /** 启动时进入托盘（不显示主窗口） */
    startInTray: false,
  }),
  getters: {
    /** 旧持久化数据可能缺少该字段，回落到默认应用内快捷键 */
    resolvedToggleLocaleShortcut(state): string {
      return state.toggleLocaleShortcut || DEFAULT_TOGGLE_LOCALE_SHORTCUT;
    },
    windowBehavior(state): WindowBehaviorPrefs {
      return {
        autostart: state.autostart,
        closeToTray: state.closeToTray,
        startInTray: state.startInTray,
      };
    },
  },
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
    setNavPrimaryWidth(width: number, max = NAV_PRIMARY_MAX) {
      this.navPrimaryWidth = Math.min(max, clampNavPrimaryWidth(width));
    },
    setNavSecondaryWidth(width: number, max = NAV_SECONDARY_MAX) {
      this.navSecondaryWidth = Math.min(max, clampNavSecondaryWidth(width));
    },
    setToggleLocaleShortcut(shortcut: string) {
      this.toggleLocaleShortcut = shortcut || DEFAULT_TOGGLE_LOCALE_SHORTCUT;
    },
    setToggleLocaleShortcutEnabled(v: boolean | null) {
      this.toggleLocaleShortcutEnabled = v ?? false;
    },
    setBetaFeaturesEnabled(v: boolean | null) {
      this.betaFeaturesEnabled = v ?? false;
    },
    setAutostart(v: boolean | null) {
      this.autostart = v ?? false;
      void applyWindowBehavior(this.windowBehavior);
    },
    setCloseToTray(v: boolean | null) {
      this.closeToTray = v ?? false;
      void applyWindowBehavior(this.windowBehavior);
    },
    setStartInTray(v: boolean | null) {
      this.startInTray = v ?? false;
      void applyWindowBehavior(this.windowBehavior);
    },
    /** 从 localStorage / 旧琉雀 Q prefs 对齐，并同步系统托盘与自启 */
    async syncWindowBehaviorFromStorage() {
      const early = loadWindowBehaviorPrefs();
      const migrated = migrateApexQWindowBehaviorIfNeeded({
        autostart: this.autostart || early.autostart,
        closeToTray: this.closeToTray || early.closeToTray,
        startInTray: this.startInTray || early.startInTray,
      });
      this.autostart = migrated.autostart;
      this.closeToTray = migrated.closeToTray;
      this.startInTray = migrated.startInTray;
      await applyWindowBehavior(migrated);
    },
    /** 补齐旧版本持久化中缺失的快捷键字段；顺带丢掉已废弃的全局开关字段 */
    ensureShortcutDefaults() {
      if (!this.toggleLocaleShortcut) {
        this.toggleLocaleShortcut = DEFAULT_TOGGLE_LOCALE_SHORTCUT;
      }
      if (typeof this.toggleLocaleShortcutEnabled !== 'boolean') {
        this.toggleLocaleShortcutEnabled = true;
      }
      if (typeof this.betaFeaturesEnabled !== 'boolean') {
        this.betaFeaturesEnabled = false;
      }
      // 旧持久化可能仍带 globalShortcutsEnabled；从 state 上删掉避免继续同步
      const anyState = this as unknown as Record<string, unknown>;
      if ('globalShortcutsEnabled' in anyState) {
        delete anyState.globalShortcutsEnabled;
      }
    },
  },
  tauri: {
    // 侧栏拖拽会高频改 width；防抖同步，避免每像素一次 IPC 拖慢动画
    syncStrategy: 'debounce',
    syncInterval: 300,
    saveStrategy: 'debounce',
    saveInterval: 500,
  },
});
