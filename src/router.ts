import {createRouter, createWebHashHistory} from 'vue-router';
import type {Component} from 'vue';
import {markRaw} from 'vue';
import ApexLegendsIcon from './components/icons/ApexLegendsIcon.vue';
import {useSettingsStore} from '@/stores/settings.ts';
import i18n from '@/i18n/i18n.ts';
import {resolveLocale} from '@/utils/locale.ts';
import {getCurrentWindow} from '@tauri-apps/api/window';

const HomeView = () => import('./views/HomeView.vue');
const AboutView = () => import('./views/AboutView.vue');
const WelcomeView = () => import('./views/WelcomeView.vue');
const SettingsView = () => import('./views/SettingsView.vue');
const GamePage = () => import('./pages/GamePage.vue');
const WindowsPage = () => import('./pages/WindowsPage.vue');
const ApexPage = () => import('./pages/game/ApexPage.vue');

const ExplorerPage = () => import('./pages/windows/ExplorerPage.vue');
const DashboardView = () => import('./views/DashboardView.vue');
const Error404View = () => import('./views/Error404View.vue');
const ServerPage = () => import('./pages/ServerPage.vue');
const PortForwardingPage = () => import('./pages/server/PortForwardingPage.vue');
// const PubgPage = () => import('./pages/game/PubgPage.vue');

/** 不参与「恢复上次页面」的路径名列表(不含 query/hash；与 `to.fullPath` 去掉参数字段后比较) */
export const RESTORE_LAST_ROUTE_EXCLUDED_PATHS: readonly string[] = ['/about', '/welcome', '/dashboard'];

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
  // {
  //   path: '/pubg',
  //   name: 'PUBG',
  //   nameKey: 'nav.pubg',
  //   component: PubgPage,
  //   iconComponent: markRaw(PUBGIcon)
  // }
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


const routes = [
  {
    path: '/', component: HomeView,
    redirect: import.meta.env.DEV ? '/dashboard' : '/welcome',
    children: [{ path: '/dashboard', component: DashboardView }, { path: '/settings', component: SettingsView },]
  },
  { path: '/about', component: AboutView },
  { path: '/welcome', component: WelcomeView },
  { path: '/tools', component: HomeView, redirect: '/game', children: tools, name: 'Tools' },

  // 404
  { path: '/404', name: '404', component: Error404View, hidden: true, meta: { title: '404' } },
  { path: '/:pathMatch(.*)', name: 'notFound', hidden: true, redirect: '/404', }
];

const router = createRouter({
  // history: createMemoryHistory(),
  history: createWebHashHistory(), // 使用hash模式
  routes,
});

let isRestoreLastRoute = false;

/** 路径所属侧栏工具分类(/game | /windows | /server)；不在侧栏工具内则为 null */
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

/** 若为某分类下的子工具页,返回该分类 path；分类根路径本身返回 null */
export function toolCategoryForLeafChildPath(path: string): string | null {
  const normalized = path.split(/[?#]/)[0] ?? '';
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

function isRestoreExcludedPath(fullPath: string): boolean {
  const path = fullPath.split(/[?#]/)[0] ?? '';
  return RESTORE_LAST_ROUTE_EXCLUDED_PATHS.includes(path);
}

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

router.beforeEach((to, from, next) => {
  const settings = useSettingsStore();
  i18n.global.locale.value = resolveLocale(settings.locale);

  if (
    settings.restoreLastRoute &&
    settings.lastRoute &&
    !isRestoreExcludedPath(settings.lastRoute)
  ) {
    const win = getCurrentWindow();
    if (win.label === 'main' && !isRestoreLastRoute) {
      isRestoreLastRoute = true;
      next(settings.lastRoute);
      return;
    }
  }

  const toPath = to.path.split(/[?#]/)[0] ?? '';
  const isToolCategoryRoot = tools.some((t) => t.path === toPath);
  if (isToolCategoryRoot && from.matched.length > 0) {
    const fromPath = from.path.split(/[?#]/)[0] ?? '';
    const fromCat = toolCategoryContainingPath(fromPath);
    const toCat = toPath;
    if (fromCat !== toCat) {
      const saved = settings.lastToolCategoryChild[toCat];
      if (saved) {
        next({ path: saved, replace: true });
        return;
      }
    }
  }

  next();
});

export default router;
export {
  tools,
};
