import {createApp, type App as VueApp} from 'vue';
import App from './App.vue';
// CSS
import '@/assets/styles/global.css';
import '@/assets/styles/search.css';
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
import i18n, {setAppLocale} from '@/i18n/i18n.ts';
import {useSettingsStore} from '@/stores/settings.ts';
import {useDebugStore} from '@/stores/debug.ts';
import {useUiStyleStore} from '@/stores/style.ts';
import {setDebugEnabled} from '@/utils/debug.ts';
import {applyDocumentLocale, resolveLocale} from '@/utils/locale.ts';
import {setupLocaleToggleShortcut} from '@/utils/global-shortcuts.ts';
import {
  bootstrapApexQEventListeners,
  bootstrapApexQFromStorage,
  setApexQOverlayInteractionMode,
  syncApexQHotkey,
} from '@/utils/apex_q.ts';
import {shouldShowMainWindowOnBoot} from '@/utils/window_behavior.ts';
import {setTrayBetaFeatures, setTrayLocale, syncTrayWithMainWindow} from '@/ipc/commands.ts';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {listen, type UnlistenFn} from '@tauri-apps/api/event';
import {initFrontendLogger} from '@/utils/logger.ts';
import {findAccent, persistAccentHint} from '@/themes.ts';
import {alignWindowHashWithStoredLastRoute} from '@/utils/restore-last-route-hash.ts';
import {runAllHmrCleanups} from '@/utils/hmr.ts';
import {registerHmrCleanup} from '@/utils/hmr.ts';
import {startTauriStoreOnce} from '@/utils/tauri_store.ts';
import {installNativeTooltip} from '@/utils/native_tooltip.ts';
import {openApexQWindow} from '@/utils/windows.ts';
import {loadApexQPrefs} from '@/types/apex_q.ts';

initFrontendLogger();

const disposeNativeTooltip = installNativeTooltip('mx-native-tooltip');

const isMainWindow = getCurrentWindow().label === 'main';
let vueApp: VueApp | null = null;
let stopApexQOpenRequest: UnlistenFn | null = null;
let stopApexQAdjustRequest: UnlistenFn | null = null;
let apexQRequestListenersStarting: Promise<void> | null = null;
let apexQRequestListenersDisposed = false;
let apexQRequestCleanupRegistered = false;

function reportApexQWindowOpenFailure(error: unknown) {
  console.warn('open apex-q window failed', error);
}

function parseApexQTrayTarget(value: unknown) {
  const target = typeof value === 'string'
    ? value
    : value && typeof value === 'object'
      ? (value as {target?: unknown}).target
      : null;
  return target === 'ocr' || target === 'settings' || target === 'background' || target === 'overlay'
    ? target
    : 'workspace' as const;
}

async function ensureApexQRequestListeners() {
  if (!isMainWindow || apexQRequestListenersDisposed) return;
  if (!apexQRequestCleanupRegistered) {
    apexQRequestCleanupRegistered = true;
    registerHmrCleanup(() => {
      apexQRequestListenersDisposed = true;
      stopApexQOpenRequest?.();
      stopApexQOpenRequest = null;
      stopApexQAdjustRequest?.();
      stopApexQAdjustRequest = null;
      apexQRequestListenersStarting = null;
    });
  }
  if (!apexQRequestListenersStarting) {
    apexQRequestListenersStarting = (async () => {
      if (!stopApexQOpenRequest) {
        const unlisten = await listen<unknown>('apex-q-open-request', (event) => {
          void openApexQWindow(parseApexQTrayTarget(event.payload))
            .catch(reportApexQWindowOpenFailure);
        });
        if (apexQRequestListenersDisposed) unlisten();
        else stopApexQOpenRequest = unlisten;
      }
      if (!stopApexQAdjustRequest && !apexQRequestListenersDisposed) {
        const unlisten = await listen('apex-q-overlay-adjust-request', () => {
          void (async () => {
            const hasOverlay = await setApexQOverlayInteractionMode('adjusting');
            if (!hasOverlay) await openApexQWindow('overlay');
          })().catch(reportApexQWindowOpenFailure);
        });
        if (apexQRequestListenersDisposed) unlisten();
        else stopApexQAdjustRequest = unlisten;
      }
    })().finally(() => {
      apexQRequestListenersStarting = null;
    });
  }
  await apexQRequestListenersStarting;
}

// 正常/调试启动始终显示主窗口；仅开机自启且勾选「启动进托盘」时保持隐藏。
// 主窗口显示时不显示托盘，隐藏时才显示。
if (isMainWindow) {
  void (async () => {
    try {
      await ensureApexQRequestListeners();
    } catch (e) {
      console.warn('register apex-q window listeners failed', e);
    }
    try {
      await bootstrapApexQEventListeners();
    } catch (e) {
      console.warn('register apex-q event listeners failed', e);
    }
    const show = await shouldShowMainWindowOnBoot();
    if (show) await getCurrentWindow().show();
    await syncTrayWithMainWindow();
  })().catch((e) => console.warn('initialize main window visibility failed', e));
}
window.__splashStart = Date.now();

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
  const style = useUiStyleStore();
  await Promise.all([
    startTauriStoreOnce('settings', () => settings.$tauri.start()),
    startTauriStoreOnce('debug', () => debugStore.$tauri.start()),
    startTauriStoreOnce('style', () => style.$tauri.start()),
  ]);
  settings.ensureShortcutDefaults();
  await settings.syncWindowBehaviorFromStorage();
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
    localStorage.setItem('mx-theme-preference', style.theme);
    localStorage.setItem('mx-theme', style.themeStyle);
  } catch { /* localStorage may be unavailable */
  }
  persistAccentHint(findAccent(style.accent), style.isDark);

  await setAppLocale(resolveLocale(settings.locale));
  applyDocumentLocale(settings.locale);
  if (isMainWindow) {
    void (async () => {
      await setTrayBetaFeatures(settings.betaFeaturesEnabled);
      await setTrayLocale(resolveLocale(settings.locale));
    })().catch((e) => console.warn('sync tray preferences failed', e));
  }

  app.use(i18n);
  app.use(Toast, toastOptions);
  app.use(vuetify);
  app.use(router);

  // DevTools 控制台不是 module,不能直接 `import { invoke }`；开发环境挂载到 window 便于调试
  if (isMainWindow && import.meta.env.DEV) {
    const {invoke} = await import('@tauri-apps/api/core');
    (window as unknown as {mxInvoke: typeof invoke}).mxInvoke = invoke;
  }

  app.mount('#app');
  vueApp = app;
  if (isMainWindow) {
    try {
      await ensureApexQRequestListeners();
    } catch (e) {
      console.warn('register apex-q window listeners after mount failed', e);
    }
  }
  let localeShortcutSetup: Promise<void> | null = null;
  if (import.meta.env.DEV) {
    const shortcutKey = '__mx_locale_shortcut_setup_v1';
    const g = globalThis as { [shortcutKey]?: boolean };
    if (!g[shortcutKey]) {
      g[shortcutKey] = true;
      localeShortcutSetup = setupLocaleToggleShortcut();
    }
  } else if (isMainWindow) {
    localeShortcutSetup = setupLocaleToggleShortcut();
  }
  if (isMainWindow) {
    try {
      await localeShortcutSetup;
    } catch (e) {
      console.warn('setup locale toggle shortcut failed', e);
    }
    try {
      if (settings.betaFeaturesEnabled) {
        await bootstrapApexQFromStorage();
      } else {
        await syncApexQHotkey({...loadApexQPrefs(), enabled: false});
      }
    } catch (e) {
      console.warn('sync beta apex-q state failed', e);
    }
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposeNativeTooltip();
    runAllHmrCleanups();
    vueApp?.unmount();
    vueApp = null;
  });
}

bootstrap().then(() => {
});
