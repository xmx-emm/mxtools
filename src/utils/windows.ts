import {WebviewWindow} from '@tauri-apps/api/webviewWindow';
import type {WebviewOptions} from '@tauri-apps/api/webview';
import type {WindowOptions} from '@tauri-apps/api/window';
import {emit} from '@tauri-apps/api/event';
import i18n from '@/i18n/i18n.ts';
import {
  APEX_Q_WINDOW_NAVIGATE_EVENT,
  APEX_Q_WINDOW_TARGET_STORAGE_KEY,
  type ApexQWindowTarget,
} from '@/types/apex_q.ts';
import {
  emitApexQuickPresetAccount,
  rememberApexQuickPresetAccount,
} from '@/utils/game/apex_config_events.ts';

const APEX_Q_WIN_REV_KEY = 'mx-apex-q-win-rev';
/** 无边框标题栏版本：旧带系统装饰的窗口需销毁重建 */
const APEX_Q_WIN_REV = 'undecorated-v2';
type OpenWebWindowOptions = Omit<WebviewOptions, 'x' | 'y' | 'width' | 'height'> & WindowOptions;
const pendingWindowCreates = new Map<string, Promise<void>>();
let apexQRevisionPromise: Promise<void> | null = null;
let apexQRevisionEnsured = false;

function waitForWindowCreated(webview: WebviewWindow, route: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true;
      console.error(`${route} window creation failed`, reason);
      reject(reason instanceof Error ? reason : new Error(String(reason)));
    };
    void webview.once('tauri://created', () => {
      if (settled) return;
      settled = true;
      resolve();
    }).catch(fail);
    void webview.once('tauri://error', (event: {payload?: unknown}) => {
      fail(event.payload ?? `${route} window creation failed`);
    }).catch(fail);
  });
}

async function activateWebWindow(
  window: WebviewWindow,
  route: string,
  options?: WindowOptions,
) {
  await window.setTitle(options?.title || route);
  if (options?.decorations === false) {
    try {
      await window.setDecorations(false);
    } catch (e) {
      console.warn(`${route} setDecorations failed`, e);
    }
  }
  await window.show();
  try {
    await window.unminimize();
  } catch {
    /* Older runtimes may not expose unminimize for every window. */
  }
  await window.setFocus();
}

async function openWebWindow(route: string, options?: OpenWebWindowOptions) {
  const title = options?.title;
  const windowName = `${route}-window`;
  const pending = pendingWindowCreates.get(windowName);
  if (pending) {
    try {
      await pending;
    } catch {
      /* The next call can retry a failed native window creation. */
    }
  }
  const window = await WebviewWindow.getByLabel(windowName);
  if (window !== null) {
    await activateWebWindow(window, route, options);
    return;
  }
  // A concurrent call can begin creation while getByLabel() is in flight.
  // Recheck the gate before constructing another window with the same label.
  const racingCreation = pendingWindowCreates.get(windowName);
  if (racingCreation) {
    try {
      await racingCreation;
    } catch {
      /* Fall through and retry creation below. */
    }
    const createdWindow = await WebviewWindow.getByLabel(windowName);
    if (createdWindow) {
      await activateWebWindow(createdWindow, route, options);
      return;
    }
  }
  const webview = new WebviewWindow(windowName, {
    url: `#/${route}`, // 对应 Vue Router 的路径(Hash 模式加 #)
    title: title || route,
    width: options?.width || (route === 'about' ? 750 : 600),
    height: options?.height || (route === 'about' ? 600 : 400),
    ...options,
  });
  const creation = waitForWindowCreated(webview, route);
  pendingWindowCreates.set(windowName, creation);
  try {
    await creation;
  } finally {
    if (pendingWindowCreates.get(windowName) === creation) {
      pendingWindowCreates.delete(windowName);
    }
  }
  await activateWebWindow(webview, route, options);
}

function openAboutWindow() {
  openWebWindow('about', { height: 600, title: '关于' }).then(() => {
  });
}

async function openApexQWindow(target: ApexQWindowTarget = 'workspace') {
  const windowName = 'apex-q-window';
  try {
    localStorage.setItem(APEX_Q_WINDOW_TARGET_STORAGE_KEY, target);
  } catch {
    /* The live event below still navigates an existing workbench. */
  }
  if (!apexQRevisionEnsured) {
    if (!apexQRevisionPromise) {
      apexQRevisionPromise = (async () => {
        let storedRevision: string | null = null;
        try {
          storedRevision = localStorage.getItem(APEX_Q_WIN_REV_KEY);
        } catch {
          /* Storage may be unavailable in a browser preview. */
        }
        if (storedRevision !== APEX_Q_WIN_REV) {
          let revisionApplied = true;
          const existing = await WebviewWindow.getByLabel(windowName);
          if (existing) {
            try {
              // destroy() removes an old decorated window; close() may only hide it.
              await existing.destroy();
            } catch (e) {
              console.warn('destroy apex-q window failed', e);
              revisionApplied = false;
            }
          }
          if (revisionApplied) {
            try {
              localStorage.setItem(APEX_Q_WIN_REV_KEY, APEX_Q_WIN_REV);
            } catch {
              /* The revision check is an optimization; the window can still open. */
            }
          }
          apexQRevisionEnsured = revisionApplied;
          return;
        }
        apexQRevisionEnsured = true;
      })();
    }
    try {
      await apexQRevisionPromise;
    } finally {
      apexQRevisionPromise = null;
    }
  }
  await openWebWindow('apex-q', {
    width: 900,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    title: String(i18n.global.t('apex.apexQ.windowTitle')),
    decorations: false,
    center: true,
    preventOverflow: true,
  });
  try {
    await emit(APEX_Q_WINDOW_NAVIGATE_EVENT, {target});
  } catch {
    /* A newly-created workbench reads the persisted target on mount. */
  }
}

async function openApexQuickPresetWindow(accountKey: string | null = null) {
  const query = accountKey ? `?account=${encodeURIComponent(accountKey)}` : '';
  rememberApexQuickPresetAccount(accountKey);
  await openWebWindow('apex-quick-preset', {
    url: `#/apex-quick-preset${query}`,
    width: 760,
    height: 760,
    title: String(i18n.global.t('apexQuickPreset.title')),
    decorations: false,
    center: true,
    preventOverflow: true,
  });
  await emitApexQuickPresetAccount(accountKey).catch(() => undefined);
}

export {
  openWebWindow,
  openAboutWindow,
  openApexQWindow,
  openApexQuickPresetWindow,
};
