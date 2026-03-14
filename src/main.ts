import {createApp} from 'vue';
import App from './App.vue';
import router from './router';
// CSS
import '@/assets/styles/global.css';
import '@/assets/styles/styles.css';
import '@/assets/styles/utils.css';
// Toast
import Toast from 'vue-toastification';
import 'vue-toastification/dist/index.css';
// Vuetify
import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';

// Store
import {createPinia} from 'pinia';
import {createPlugin} from '@tauri-store/pinia';
// UI
import vuetify from "@/vuetify.ts";
import {applyAccentTheme} from "@/vuetify.ts";
import {toastOptions} from "@/toast.ts";

// i18n
import i18n from '@/i18n/i18n';
import {useSettingsStore} from '@/stores/settings';
import {uiStyleStore} from '@/stores/style';
import {resolveLocale} from '@/utils/locale';
import {setupLocaleToggleShortcut} from '@/utils/global-shortcuts';
import {getCurrentWindow} from "@tauri-apps/api/window";
import {initFrontendLogger} from '@/utils/logger';
import {findAccent, persistAccentHint} from '@/themes';

initFrontendLogger();

getCurrentWindow().show().then(() => {
});
const splashStart = Date.now();
(window as any).__splashStart = splashStart;

let isRestoreLastRoute = false;

router.afterEach((to) => {
    const settings = useSettingsStore();
    if (settings.restoreLastRoute) {
        settings.setLastRoute(to.fullPath);
    }
});

router.beforeEach((_to, _from, next) => {
    const settings = useSettingsStore();
    i18n.global.locale.value = resolveLocale(settings.locale);

    if (settings.restoreLastRoute && settings.lastRoute) {
        const win = getCurrentWindow();
        if (win.label === "main" && !isRestoreLastRoute) {
            isRestoreLastRoute = true;
            next(settings.lastRoute);
            return;
        }
    }
    next();
});

async function bootstrap() {
    const app = createApp(App);
    const pinia = createPinia();
    pinia.use(createPlugin());
    app.use(pinia);

    const settings = useSettingsStore();
    const style = uiStyleStore();
    await Promise.all([settings.$tauri.start(), style.$tauri.start()]);

    // 应用主题色到 Vuetify
    applyAccentTheme(style.accent);

    // 同步到 localStorage 供下次启动的 splash 使用
    try {
        localStorage.setItem('mx-theme', style.themeStyle);
    } catch (_) { /* noop */
    }
    persistAccentHint(findAccent(style.accent), style.isDark);

    i18n.global.locale.value = resolveLocale(settings.locale);

    app.use(i18n);
    app.use(Toast, toastOptions);
    app.use(vuetify);
    app.use(router);
    app.mount('#app');
    void setupLocaleToggleShortcut();
}

bootstrap().then(() => {
});
