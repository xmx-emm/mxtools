import {createApp, type App as VueApp} from 'vue';
import App from './App.vue';
// CSS
import '@/assets/styles/global.css';
import '@/assets/styles/styles.css';
import '@/assets/styles/utils.css';
// Toast
import Toast from 'vue-toastification';
import 'vue-toastification/dist/index.css';
// Vuetify
import 'vuetify/styles';

// Store
import {createPinia} from 'pinia';
import {createPlugin} from '@tauri-store/pinia';
// UI
import vuetify, {applyAccentTheme} from '@/vuetify.ts';
import {toastOptions} from '@/toast.ts';

// i18n
import i18n from '@/i18n/i18n';
import {useSettingsStore} from '@/stores/settings';
import {useDebugStore} from '@/stores/debug';
import {uiStyleStore} from '@/stores/style';
import {setDebugEnabled} from '@/utils/debug';
import {resolveLocale} from '@/utils/locale';
import {setupLocaleToggleShortcut} from '@/utils/global-shortcuts';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {initFrontendLogger} from '@/utils/logger';
import {findAccent, persistAccentHint} from '@/themes';
import {alignWindowHashWithStoredLastRoute} from '@/utils/restore-last-route-hash';
import {runAllHmrCleanups} from '@/utils/hmr.ts';
import {startTauriStoreOnce} from '@/utils/tauri_store.ts';

initFrontendLogger();

getCurrentWindow().show().then(() => {
});
const splashStart = Date.now();
(window as any).__splashStart = splashStart;

let vueApp: VueApp | null = null;

async function bootstrap() {
  if (vueApp) {
    vueApp.unmount();
    vueApp = null;
  }

  const app = createApp(App);
  const pinia = import.meta.env.DEV
    ? ((globalThis as { __mx_pinia?: ReturnType<typeof createPinia> }).__mx_pinia ?? (() => {
        const p = createPinia();
        p.use(createPlugin());
        (globalThis as { __mx_pinia?: ReturnType<typeof createPinia> }).__mx_pinia = p;
        return p;
      })())
    : (() => {
        const p = createPinia();
        p.use(createPlugin());
        return p;
      })();
  app.use(pinia);

  const settings = useSettingsStore();
  const debugStore = useDebugStore();
  const style = uiStyleStore();
  await Promise.all([
    startTauriStoreOnce('settings', () => settings.$tauri.start()),
    startTauriStoreOnce('debug', () => debugStore.$tauri.start()),
    startTauriStoreOnce('style', () => style.$tauri.start()),
  ]);
  setDebugEnabled(debugStore.enabled);
  debugStore.$subscribe(() => {
    setDebugEnabled(debugStore.enabled);
  });

  // 必须在首次 import `./router`(创建 hash history)之前对齐 hash，否则会出现「默认首屏 + replace 恢复」两次导航
  alignWindowHashWithStoredLastRoute(settings.restoreLastRoute, settings.lastRoute);
  const {default: router} = await import('./router');

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

  // DevTools 控制台不是 module,不能直接 `import { invoke }`；开发环境挂载到 window 便于调试
  if (import.meta.env.DEV) {
    const {invoke} = await import('@tauri-apps/api/core');
    (window as unknown as {mxInvoke: typeof invoke}).mxInvoke = invoke;
  }

  app.mount('#app');
  vueApp = app;
  if (import.meta.env.DEV) {
    const shortcutKey = '__mx_locale_shortcut_setup_v1';
    const g = globalThis as { [shortcutKey]?: boolean };
    if (!g[shortcutKey]) {
      g[shortcutKey] = true;
      void setupLocaleToggleShortcut();
    }
  } else {
    void setupLocaleToggleShortcut();
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    runAllHmrCleanups();
    vueApp?.unmount();
    vueApp = null;
  });
}

bootstrap().then(() => {
});
