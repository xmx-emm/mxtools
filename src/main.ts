import {createApp} from 'vue';
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
import '@mdi/font/css/materialdesignicons.css';

// Store
import {createPinia} from 'pinia';
import {createPlugin} from '@tauri-store/pinia';
// UI
import vuetify, {applyAccentTheme} from '@/vuetify.ts';
import {toastOptions} from '@/toast.ts';

// i18n
import i18n from '@/i18n/i18n';
import {useSettingsStore} from '@/stores/settings';
import {uiStyleStore} from '@/stores/style';
import {resolveLocale} from '@/utils/locale';
import {setupLocaleToggleShortcut} from '@/utils/global-shortcuts';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {initFrontendLogger} from '@/utils/logger';
import {findAccent, persistAccentHint} from '@/themes';
import {alignWindowHashWithStoredLastRoute} from '@/utils/restore-last-route-hash';

initFrontendLogger();

getCurrentWindow().show().then(() => {
});
const splashStart = Date.now();
(window as any).__splashStart = splashStart;


async function bootstrap() {
  const app = createApp(App);
  const pinia = createPinia();
  pinia.use(createPlugin());
  app.use(pinia);

  const settings = useSettingsStore();
  const style = uiStyleStore();
  await Promise.all([settings.$tauri.start(), style.$tauri.start()]);

  // 必须在首次 import `./router`（创建 hash history）之前对齐 hash，否则会出现「默认首屏 + replace 恢复」两次导航
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
  void setupLocaleToggleShortcut();
}

bootstrap().then(() => {
});
