import {WebviewWindow} from '@tauri-apps/api/webviewWindow';
import type {WindowOptions} from '@tauri-apps/api/window';
import {emit} from '@tauri-apps/api/event';
import i18n from '@/i18n/i18n.ts';
import {
  ALTER_Q_WINDOW_NAVIGATE_EVENT,
  ALTER_Q_WINDOW_TARGET_STORAGE_KEY,
  type AlterQWindowTarget,
} from '@/types/alter_q.ts';

const ALTER_Q_WIN_REV_KEY = 'mx-alter-q-win-rev';
/** 无边框标题栏版本：旧带系统装饰的窗口需销毁重建 */
const ALTER_Q_WIN_REV = 'undecorated-v2';
const pendingWindowCreates = new Map<string, Promise<void>>();
let alterQRevisionPromise: Promise<void> | null = null;
let alterQRevisionEnsured = false;

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

async function openWebWindow(route: string, options?: WindowOptions) {
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

async function openAlterQWindow(target: AlterQWindowTarget = 'workspace') {
  const windowName = 'alter-q-window';
  try {
    localStorage.setItem(ALTER_Q_WINDOW_TARGET_STORAGE_KEY, target);
  } catch {
    /* The live event below still navigates an existing workbench. */
  }
  if (!alterQRevisionEnsured) {
    if (!alterQRevisionPromise) {
      alterQRevisionPromise = (async () => {
        let storedRevision: string | null = null;
        try {
          storedRevision = localStorage.getItem(ALTER_Q_WIN_REV_KEY);
        } catch {
          /* Storage may be unavailable in a browser preview. */
        }
        if (storedRevision !== ALTER_Q_WIN_REV) {
          let revisionApplied = true;
          const existing = await WebviewWindow.getByLabel(windowName);
          if (existing) {
            try {
              // destroy() removes an old decorated window; close() may only hide it.
              await existing.destroy();
            } catch (e) {
              console.warn('destroy alter-q window failed', e);
              revisionApplied = false;
            }
          }
          if (revisionApplied) {
            try {
              localStorage.setItem(ALTER_Q_WIN_REV_KEY, ALTER_Q_WIN_REV);
            } catch {
              /* The revision check is an optimization; the window can still open. */
            }
          }
          alterQRevisionEnsured = revisionApplied;
          return;
        }
        alterQRevisionEnsured = true;
      })();
    }
    try {
      await alterQRevisionPromise;
    } finally {
      alterQRevisionPromise = null;
    }
  }
  await openWebWindow('alter-q', {
    width: 900,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    title: String(i18n.global.t('apex.alterQ.windowTitle')),
    decorations: false,
    center: true,
    preventOverflow: true,
  });
  try {
    await emit(ALTER_Q_WINDOW_NAVIGATE_EVENT, {target});
  } catch {
    /* A newly-created workbench reads the persisted target on mount. */
  }
}

export {
  openWebWindow,
  openAboutWindow,
  openAlterQWindow,
};
