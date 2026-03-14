import {createRouter, createWebHashHistory} from 'vue-router';
import type {Component} from 'vue';
import {markRaw} from 'vue';

const HomeView = () => import('./views/HomeView.vue');
const AboutView = () => import('./views/AboutView.vue');
const WelcomeView = () => import('./views/WelcomeView.vue');
const SettingsView = () => import('./views/SettingsView.vue');
const GamePage = () => import('./pages/GamePage.vue');
const WindowsPage = () => import('./pages/WindowsPage.vue');
const ApexPage = () => import('./pages/game/ApexPage.vue');
import ApexLegendsIcon from './components/icons/ApexLegendsIcon.vue';
const ExplorerPage = () => import('./pages/windows/ExplorerPage.vue');
const DashboardView = () => import('./views/DashboardView.vue');
const Error404View = () => import('./views/Error404View.vue');
const ServerPage = () => import('./pages/ServerPage.vue');
const PortForwardingPage = () => import('./pages/server/PortForwardingPage.vue');

export interface ToolChild {
    path: string;
    name: string;
    nameKey: string;
    component: Component;
    icon: string;
    iconComponent?: Component;
}

const game_tools: ToolChild[] = [
    {
        path: '/apex',
        name: 'Apex',
        nameKey: 'nav.apex',
        component: ApexPage,
        icon: 'mdi-fax',
        iconComponent: markRaw(ApexLegendsIcon)
    },
];
const windows_tools: ToolChild[] = [
    {path: '/explorer', name: 'Explorer', nameKey: 'nav.explorer', component: ExplorerPage, icon: 'mdi-folder-outline'},
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
        redirect: '/apex',
        children: [{path: '/dashboard', component: DashboardView}, {path: '/settings', component: SettingsView},]
    },
    {path: '/about', component: AboutView},
    {path: '/welcome', component: WelcomeView},
    {path: '/tools', component: HomeView, redirect: '/game', children: tools, name: 'Tools'},

    // 404
    {path: '/404', name: '404', component: Error404View, hidden: true, meta: {title: '404'}},
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
