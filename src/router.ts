import {createRouter, createWebHashHistory, type RouteLocationNormalized} from 'vue-router';
import type {Component} from 'vue';
import {markRaw} from 'vue';
import ApexLegendsIcon from './components/icons/ApexLegendsIcon.vue';
import {useSettingsStore} from '@/stores/settings.ts';
import i18n from '@/i18n/i18n.ts';
import {resolveLocale} from '@/utils/locale.ts';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {openAboutWindow} from '@/utils/windows.ts';
import {consumeRestoreHashAlignedForRouter} from '@/utils/restore-last-route-hash';
import PUBGIcon from '@/components/icons/PUBGIcon.vue';

const HomeView = () => import('./views/HomeView.vue');
const AboutView = () => import('./views/AboutView.vue');
const SettingsView = () => import('./views/SettingsView.vue');
const GamePage = () => import('./pages/GamePage.vue');
const WindowsPage = () => import('./pages/WindowsPage.vue');
const ApexPage = () => import('./pages/game/ApexPage.vue');

const ExplorerPage = () => import('./pages/windows/ExplorerPage.vue');
const DashboardView = () => import('./views/DashboardView.vue');
const Error404View = () => import('./views/Error404View.vue');
const ServerPage = () => import('./pages/ServerPage.vue');
const PortForwardingPage = () => import('./pages/server/PortForwardingPage.vue');
const PubgPage = () => import('./pages/game/PubgPage.vue');

/** 不参与「恢复上次页面」的路径名列表(不含 query/hash；与 `to.fullPath` 去掉参数字段后比较) */
export const RESTORE_LAST_ROUTE_EXCLUDED_PATHS: readonly string[] = ['/about',];

/** 侧栏「工具」子项元数据：路由、文案 key、图标等，供导航与 `router.ts` 内工具表共用 */
export interface ToolChild {
  path: string;
  name: string;
  nameKey: string;
  component: Component;
  icon?: string;
  iconComponent?: Component;
}

const game_tools: ToolChild[] = [
  {
    path: '/apex',
    name: 'Apex',
    nameKey: 'nav.apex',
    component: ApexPage,
    iconComponent: markRaw(ApexLegendsIcon)
  },
  {
    path: '/pubg',
    name: 'PUBG',
    nameKey: 'nav.pubg',
    component: PubgPage,
    iconComponent: markRaw(PUBGIcon)
  }
];
const windows_tools: ToolChild[] = [
  { path: '/explorer', name: 'Explorer', nameKey: 'nav.explorer', component: ExplorerPage, icon: 'mdi-folder-outline' },
  // { path: '/remote_desktop', name: 'RemoteDesktop', nameKey: 'nav.remoteDesktop', component: RemoteDesktopPage, icon: 'mdi-remote-desktop' },
  // { path: '/input_method', name: 'Input Method', nameKey: 'nav.inputMethod', component: InputMethodPage, icon: 'mdi-keyboard-variant' },
];
export const server_tools: ToolChild[] = [
  {
    path: '/port_forwarding',
    name: 'Port Forwarding',
    nameKey: 'nav.portForwarding',
    component: PortForwardingPage,
    icon: 'mdi-server-network'
  },
];

/** 三大工具分类及其子路由，与侧栏结构一致；`toolCategoryContainingPath` 等依赖此表 */
const tools = [
  {
    path: '/game',
    name: 'Game',
    nameKey: 'nav.game',
    component: GamePage,
    children: game_tools,
    icon: 'mdi-gamepad-variant-outline'
  },
  {
    path: '/windows',
    name: 'Windows',
    nameKey: 'nav.windows',
    component: WindowsPage,
    children: windows_tools,
    icon: 'mdi-laptop'
  },
  {
    path: '/server',
    name: 'Server',
    nameKey: 'nav.server',
    component: ServerPage,
    children: server_tools,
    icon: 'mdi-server'
  },
];


/** 应用顶层路由表（含首页、工具区、关于、404） */
const routes = [
  {
    path: '/', component: HomeView,
    redirect: '/dashboard',
    children: [{ path: '/dashboard', component: DashboardView }, { path: '/settings', component: SettingsView },]
  },
  { path: '/tools', component: HomeView, redirect: '/game', children: tools, name: 'Tools' },

  { path: '/about', component: AboutView },

  // 404
  { path: '/404', name: '404', component: Error404View, hidden: true, meta: { title: '404' } },
  { path: '/:pathMatch(.*)', name: 'notFound', hidden: true, redirect: '/404', }
];

const router = createRouter({
  history: createWebHashHistory(), // 使用 hash，便于 Tauri 本地文件部署
  routes,
});

/**
 * 主窗口是否已在本次应用生命周期内执行过「恢复上次路由」逻辑。
 * 仅第一次 `beforeEach` 会尝试 `next(lastRoute)`，避免每次导航都重定向。
 */
let isRestoreLastRoute = false;

/**
 * 判断给定路径属于哪一个「工具大类」路由（侧栏一级：/game、/windows、/server）。
 * 用于跨类切换时决定是否跳转到该大类下记住的子页。
 *
 * @param path 路由 path（可含 query/hash，会先取 path 段）
 * @returns 大类 path；若不在上述任一分类下（含子工具路径无法归属时）为 null
 */
export function toolCategoryContainingPath(path: string): string | null {
  const normalized = path.split(/[?#]/)[0] ?? '';
  for (const t of tools) {
    if (normalized === t.path) {
      return t.path;
    }
    for (const c of t.children) {
      const cp = c.path.split(/[?#]/)[0] ?? '';
      if (normalized === cp || normalized.startsWith(`${cp}/`)) {
        return t.path;
      }
    }
  }
  return null;
}

/**
 * 若当前路径是某工具大类下的「叶子子工具页」（如 /apex、/pubg），返回所属大类 path（/game 等）。
 * 若路径是大类根（如仅 /game）、无效路径或 404，返回 null。
 * 与 `toolCategoryContainingPath` 的区别：本函数排除「停在大类根」的情况，专用于 `afterEach` 记录「最后打开的叶子工具」。
 *
 * @param path 路由 path
 * @returns 大类 path；非叶子子工具或无效时为 null
 */
export function toolCategoryForLeafChildPath(path: string): string | null {
  const normalized = path.split(/[?#]/)[0] ?? '';
  if (!isValidNavigablePath(normalized)) {
    return null;
  }
  for (const t of tools) {
    if (normalized === t.path) {
      return null;
    }
    for (const c of t.children) {
      const cp = c.path.split(/[?#]/)[0] ?? '';
      if (normalized === cp || normalized.startsWith(`${cp}/`)) {
        return t.path;
      }
    }
  }
  return null;
}

/**
 * 是否不应把该路径写入「上次路由」或用于自动恢复（例如关于页单独窗口打开）。
 *
 * @param fullPath 完整路径或带 query 的片段（与设置里存的 `fullPath` 规则一致即可）
 */
function isRestoreExcludedPath(fullPath: string): boolean {
  const path = fullPath.split(/[?#]/)[0] ?? '';
  return RESTORE_LAST_ROUTE_EXCLUDED_PATHS.includes(path);
}

/**
 * 路径能否解析为应用内真实页面（非 404、非通配 notFound）。
 * 用于恢复上次路由、跳转记住的子工具前校验，避免跳到无效或已删路由。
 *
 * @param path 待校验 path（可含 query/hash，比较前会规范化）
 */
function isValidNavigablePath(path: string): boolean {
  const normalized = path.split(/[?#]/)[0] ?? '';
  if (!normalized) return false;
  const resolved = router.resolve(normalized);
  const lastMatched = resolved.matched[resolved.matched.length - 1];
  if (!lastMatched) return false;
  if (resolved.name === '404' || resolved.name === 'notFound') return false;
  return lastMatched.path !== '/:pathMatch(.*)';
}

/**
 * 当前这次导航的目标是否与「要恢复的 lastRoute」指向同一页面。
 * 若已为同一目标仍 `next(lastRoute)` 会触发多余导航与重复 `beforeEach`；此时应直接 `next()`。
 *
 * @param to 本次 `beforeEach` 的 `to`
 * @param lastFullPath 设置中保存的上次 `fullPath`
 */
function isSameRestoreDestination(to: RouteLocationNormalized, lastFullPath: string): boolean {
  if (!lastFullPath) return false;
  const lastTrim = lastFullPath.trim();
  if (to.fullPath === lastTrim) return true;
  try {
    const resolved = router.resolve(lastTrim);
    if (
      to.path === resolved.path &&
      JSON.stringify(to.query) === JSON.stringify(resolved.query) &&
      to.hash === resolved.hash
    ) {
      return true;
    }
    // 持久化的 fullPath 与解析后 to 在 query 编码上可能略有差异，path 一致则视为同一恢复目标
    const lastPathOnly = lastTrim.split(/[?#]/)[0] ?? '';
    const toPathOnly = to.path.split(/[?#]/)[0] ?? '';
    return lastPathOnly !== '' && lastPathOnly === toPathOnly;
  } catch {
    return false;
  }
}

/** 导航完成后持久化「上次完整路径」与各工具大类下最后停留的叶子子页，供下次启动或跨类切换使用。 */
router.afterEach((to) => {
  const settings = useSettingsStore();
  if (settings.restoreLastRoute && !isRestoreExcludedPath(to.fullPath)) {
    settings.setLastRoute(to.fullPath);
  }
  const leafCat = toolCategoryForLeafChildPath(to.path);
  if (leafCat) {
    const pathOnly = to.path.split(/[?#]/)[0] ?? '';
    settings.recordToolCategoryLastChild(leafCat, pathOnly);
  }
});

/**
 * 全局前置守卫：同步语言、关于页单独窗口、启动时恢复上次路由、跨工具大类时恢复该大类上次子页。
 */
router.beforeEach((to, from, next) => {
  const settings = useSettingsStore();
  i18n.global.locale.value = resolveLocale(settings.locale);

  console.log('router.beforeEach', settings.restoreLastRoute, settings.lastRoute, settings.locale);

  const toPathOnly = to.path.split(/[?#]/)[0] ?? '';
  // 主窗口不渲染 /about，改为打开独立关于窗口并取消本次导航
  if (toPathOnly === '/about') {
    const win = getCurrentWindow();
    if (win.label === 'main') {
      openAboutWindow();
      next(false);
      return;
    }
  }

  // 主窗口首次导航：可选把地址替换为上次关闭前记录的 fullPath（replace 避免多一层历史）
  if (
    settings.restoreLastRoute &&
    settings.lastRoute
  ) {
    const win = getCurrentWindow();
    if (win.label === 'main' && !isRestoreLastRoute) {
      if (consumeRestoreHashAlignedForRouter()) {
        isRestoreLastRoute = true;
        next();
        return;
      }
      isRestoreLastRoute = true;
      if (!isRestoreExcludedPath(settings.lastRoute) && isValidNavigablePath(settings.lastRoute)) {
        if (isSameRestoreDestination(to, settings.lastRoute)) {
          next();
          return;
        }
        const loc = router.resolve(settings.lastRoute);
        next({
          path: loc.path,
          query: loc.query,
          hash: loc.hash,
          replace: true,
        });
        return;
      } else {
        if (!isRestoreExcludedPath(settings.lastRoute)) {
          settings.setLastRoute('/');
        }
        next({ path: '/', replace: true });
        return;
      }
    }
  }

  // 从侧栏进入另一工具大类根路径时，若有该大类下「上次叶子子页」记忆则直接 replace 过去
  const toPath = to.path.split(/[?#]/)[0] ?? '';
  const isToolCategoryRoot = tools.some((t) => t.path === toPath);
  if (isToolCategoryRoot && from.matched.length > 0) {
    const fromPath = from.path.split(/[?#]/)[0] ?? '';
    const fromCat = toolCategoryContainingPath(fromPath);
    const toCat = toPath;
    // fromCat 为 null 表示来自 /dashboard、/settings 等非工具侧栏页；此时 null !== '/game' 会为真，
    // 误触发「跳到 /game 下记忆的子页」(如 /apex)，造成第二次导航。仅当已在某一工具大类之间切换时才恢复子页。
    if (fromCat !== null && fromCat !== toCat) {
      const saved = settings.lastToolCategoryChild[toCat];
      if (saved && isValidNavigablePath(saved)) {
        next({ path: saved, replace: true });
        return;
      }
      if (saved) {
        const nextCategoryChild = { ...settings.lastToolCategoryChild };
        delete nextCategoryChild[toCat];
        settings.lastToolCategoryChild = nextCategoryChild;
      }
    }
  }
  next();
});

export default router;
/** 工具分类配置，供侧栏 `Navigation` 等与路由共用 */
export {
  tools,
};
