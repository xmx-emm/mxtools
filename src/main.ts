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
import {useBackgroundRuntimeStore} from '@/stores/background_runtime.ts';
import {setDebugEnabled} from '@/utils/debug.ts';
import {applyDocumentLocale, resolveLocale} from '@/utils/locale.ts';
import {setupLocaleToggleShortcut} from '@/utils/global-shortcuts.ts';
import {
  bootstrapApexQEventListeners,
  bootstrapApexQFromStorage,
  setApexQOverlayInteractionMode,
  syncApexQHotkey,
} from '@/utils/apex_q.ts';
import {syncTrayWithMainWindow} from '@/ipc/commands.ts';
import {destroyMainWindow, markBackgroundMainWindowReady} from '@/ipc/commands.ts';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {listen, type UnlistenFn} from '@tauri-apps/api/event';
import {initFrontendLogger} from '@/utils/logger.ts';
import {findAccent, persistAccentHint} from '@/themes.ts';
import {alignWindowHashWithStoredLastRoute} from '@/utils/restore-last-route-hash.ts';
import {runAllHmrCleanups} from '@/utils/hmr.ts';
import {registerHmrCleanup} from '@/utils/hmr.ts';
import {startTauriStoreOnce} from '@/utils/tauri_store.ts';
import {cloneBackgroundRuntimeConfig} from '@/utils/background_runtime.ts';
import {settleStartupTask, type StartupTaskResult} from '@/utils/startup.ts';
import {installNativeTooltip} from '@/utils/native_tooltip.ts';
import {openApexQWindow} from '@/utils/windows.ts';
import {loadApexQPrefs, saveApexQPrefs} from '@/types/apex_q.ts';
import {confirm} from '@/utils/app_confirmation.ts';

type TauriRuntimeWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

/** Tauri APIs are unavailable in a Vite browser preview. */
const isTauriRuntime = typeof window !== 'undefined'
  && Boolean((window as TauriRuntimeWindow).__TAURI_INTERNALS__);

function getTauriCurrentWindow() {
  if (!isTauriRuntime) return null;
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

const currentWindow = getTauriCurrentWindow();
const isMainWindow = isTauriRuntime && currentWindow?.label === 'main';
const BACKGROUND_MIGRATION_KEY = 'mx-background-runtime-migrated-v1';
let mainCloseRequestInFlight = false;
let stopMainCloseRequest: UnlistenFn | null = null;

async function runStartupTask<T>(
  label: string,
  task: () => Promise<T>,
): Promise<StartupTaskResult<T>> {
  const result = await settleStartupTask(task);
  if (!result.ok) {
    console.error(`startup task failed: ${label}`, result.error);
  }
  return result;
}

async function migrateBackgroundRuntimeOnce(
  runtime: ReturnType<typeof useBackgroundRuntimeStore>,
  settings: ReturnType<typeof useSettingsStore>,
) {
  if (!runtime.snapshot || localStorage.getItem(BACKGROUND_MIGRATION_KEY) === '1') return;
  const config = cloneBackgroundRuntimeConfig(runtime.snapshot.config);
  config.betaFeaturesEnabled = settings.betaFeaturesEnabled;
  config.locale = settings.locale;

  const apexQ = loadApexQPrefs();
  config.apexQ = {...config.apexQ, ...apexQ};

  try {
    const legacy = JSON.parse(localStorage.getItem('mx-razer-polling-config') ?? '{}') as Record<string, unknown>;
    const executable = typeof legacy.gameExecutable === 'string'
      ? legacy.gameExecutable.trim()
      : '';
    const currentGames = Array.isArray(config.razer.games) ? config.razer.games : [];
    config.razer = {
      ...config.razer,
      enabled: legacy.enabled === true,
      deviceProfiles: config.razer.deviceProfiles ?? {},
      games: currentGames.length || !executable ? currentGames : [{
        id: 'legacy-game-profile',
        name: executable.split(/[\\/]/).pop() ?? executable,
        enabled: legacy.enabled === true,
        userEdited: true,
        matchers: [{executable, packageFamilyName: null, source: 'manual'}],
        deviceRatesHz: {},
      }],
    };
  } catch {
    // Malformed legacy Razer data is ignored; the native defaults stay valid.
  }

  await runtime.configure(config);
  saveApexQPrefs(apexQ);
  localStorage.setItem(BACKGROUND_MIGRATION_KEY, '1');
}

async function installMainCloseCoordinator() {
  if (!isMainWindow || stopMainCloseRequest) return;
  stopMainCloseRequest = await listen('main-close-to-background-request', () => {
    if (mainCloseRequestInFlight) return;
    mainCloseRequestInFlight = true;
    void (async () => {
      const [{useApexStore}, {usePubgStore}] = await Promise.all([
        import('@/stores/game/apex/index.ts'),
        import('@/stores/game/pubg/index.ts'),
      ]);
      const apex = useApexStore();
      const pubg = usePubgStore();
      const dirty = apex.is_launch_options_modified
        || apex.is_video_config_modified
        || apex.is_game_settings_modified
        || pubg.is_launch_options_modified;
      if (dirty) {
        const accepted = await confirm(i18n.global.t('settings.closeWithPendingChanges'), {
          title: i18n.global.t('settings.closeWithPendingChangesTitle'),
          kind: 'warning',
          confirmText: i18n.global.t('settings.discardAndContinueInBackground'),
        });
        if (!accepted) return;
      }
      await destroyMainWindow();
    })().catch(error => console.warn('close main window to background failed', error))
      .finally(() => {
        mainCloseRequestInFlight = false;
      });
  });
  registerHmrCleanup(() => {
    stopMainCloseRequest?.();
    stopMainCloseRequest = null;
  });
}

if (isTauriRuntime) {
  initFrontendLogger();
}

const disposeNativeTooltip = installNativeTooltip('mx-native-tooltip');
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
if (isTauriRuntime && isMainWindow) {
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
  const createPiniaInstance = () => {
    const p = createPinia();
    if (isTauriRuntime) {
      p.use(createPlugin());
    }
    return p;
  };
  const pinia = import.meta.env.DEV
    ? ((globalThis as { __mx_pinia?: ReturnType<typeof createPinia> }).__mx_pinia ?? (() => {
        const p = createPiniaInstance();
        (globalThis as { __mx_pinia?: ReturnType<typeof createPinia> }).__mx_pinia = p;
        return p;
      })())
    : createPiniaInstance();
  app.use(pinia);

  const settings = useSettingsStore();
  const backgroundRuntime = useBackgroundRuntimeStore();
  const debugStore = useDebugStore();
  const style = useUiStyleStore();
  if (isTauriRuntime) {
    await Promise.all([
      runStartupTask('settings store', () => startTauriStoreOnce('settings', () => settings.$tauri.start())),
      runStartupTask('debug store', () => startTauriStoreOnce('debug', () => debugStore.$tauri.start())),
      runStartupTask('style store', () => startTauriStoreOnce('style', () => style.$tauri.start())),
    ]);
  }
  settings.ensureShortcutDefaults();
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

  app.use(i18n);
  app.use(Toast, toastOptions);
  app.use(vuetify);
  app.use(router);

  // DevTools 控制台不是 module,不能直接 `import { invoke }`；开发环境挂载到 window 便于调试
  if (isTauriRuntime && isMainWindow && import.meta.env.DEV) {
    const {invoke} = await import('@tauri-apps/api/core');
    (window as unknown as {mxInvoke: typeof invoke}).mxInvoke = invoke;
  }

  app.mount('#app');
  vueApp = app;
  if (isTauriRuntime) {
    const [, runtimeRefresh] = await Promise.all([
      runStartupTask('window behavior', () => settings.syncWindowBehaviorFromStorage()),
      runStartupTask('background runtime refresh', () => backgroundRuntime.refresh()),
    ]);
    if (isMainWindow) {
      if (runtimeRefresh.ok) {
        await runStartupTask(
          'background runtime migration',
          () => migrateBackgroundRuntimeOnce(backgroundRuntime, settings),
        );
      }
      await runStartupTask('main close coordinator', installMainCloseCoordinator);
    }
  }
  if (isMainWindow) {
    try {
      await ensureApexQRequestListeners();
      await markBackgroundMainWindowReady();
    } catch (e) {
      console.warn('register main-window background listeners after mount failed', e);
    }
  }
  let localeShortcutSetup: Promise<void> | null = null;
  if (isTauriRuntime && import.meta.env.DEV) {
    const shortcutKey = '__mx_locale_shortcut_setup_v1';
    const g = globalThis as { [shortcutKey]?: boolean };
    if (!g[shortcutKey]) {
      g[shortcutKey] = true;
      localeShortcutSetup = setupLocaleToggleShortcut();
    }
  } else if (isTauriRuntime && isMainWindow) {
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

void bootstrap().catch((error) => {
  console.error('application bootstrap failed', error);
  const splash = document.getElementById('splash');
  const title = document.getElementById('splash-title');
  const progress = document.getElementById('splash-bar-track');
  if (splash) splash.dataset.state = 'error';
  if (title) {
    title.textContent = navigator.language.toLowerCase().startsWith('zh')
      ? '启动失败，请重试'
      : 'Startup failed. Please retry.';
  }
  if (progress) progress.hidden = true;
});
