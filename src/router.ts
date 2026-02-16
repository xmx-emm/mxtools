import {createRouter, createWebHashHistory} from 'vue-router';

import HomeView from './views/HomeView.vue';
import AboutView from './views/AboutView.vue';
import WelcomeView from './views/WelcomeView.vue';
import SettingsView from './views/SettingsView.vue';
import GamePage from './pages/GamePage.vue';
import WindowsPage from './pages/WindowsPage.vue';
import ApexPage from './pages/game/ApexPage.vue';
import ExplorerPage from './pages/windows/ExplorerPage.vue';
import DashboardView from './views/DashboardView.vue';
import Error404View from './views/Error404View.vue';
import ServerPage from './pages/ServerPage.vue';
import PortForwardingPage from './pages/server/PortForwardingPage.vue';

const game_tools = [
  { path: '/apex', name: 'Apex', nameKey: 'nav.apex', component: ApexPage, icon: 'mdi-fax' },
];
const windows_tools = [
  { path: '/explorer', name: 'Explorer', nameKey: 'nav.explorer', component: ExplorerPage, icon: 'mdi-folder-outline' },
  // { path: '/input_method', name: 'Input Method', nameKey: 'nav.inputMethod', component: InputMethodPage, icon: 'mdi-keyboard-variant' },
];
export const server_tools = [
  { path: '/port_forwarding', name: 'Port Forwarding', nameKey: 'nav.portForwarding', component: PortForwardingPage, icon: 'mdi-server-network' },
];

const tools = [
  { path: '/game', name: 'Game', nameKey: 'nav.game', component: GamePage, children: game_tools, icon: 'mdi-gamepad-variant-outline' },
  { path: '/windows', name: 'Windows', nameKey: 'nav.windows', component: WindowsPage, children: windows_tools, icon: 'mdi-laptop' },
  { path: '/server', name: 'Server', nameKey: 'nav.server', component: ServerPage, children: server_tools, icon: 'mdi-server' },
];

const routes = [
    {
        path: '/', component: HomeView, redirect: '/apex',
        children: [{path: '/dashboard', component: DashboardView}, {path: '/settings', component: SettingsView},]
    },
    {path: '/about', component: AboutView},
    {path: '/welcome', component: WelcomeView},
    {path: '/tools', component: HomeView, redirect: '/game', children: tools, name: 'Tools'},

    // 404
    { path: '/404', name: '404', component: Error404View, hidden: true, meta: { title: '404' } },
    {path: '/:pathMatch(.*)', name: 'notFound', hidden: true, redirect: '/404',}
];

const router = createRouter({
    // history: createMemoryHistory(),
    history: createWebHashHistory(), // 使用hash模式
    routes,
});

export default router;
export {
    tools,
};
