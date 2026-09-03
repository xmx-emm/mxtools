import {WebviewWindow} from '@tauri-apps/api/webviewWindow';
import type {WebviewOptions} from '@tauri-apps/api/webview';
import type {WindowOptions} from '@tauri-apps/api/window';
import {emit} from '@tauri-apps/api/event';
import i18n from '@/i18n/i18n.ts';
import {
  APEX_Q_WINDOW_NAVIGATE_EVENT,
  type ApexQWindowTarget,
} from '@/types/apex_q.ts';
import {
  emitApexLaunchRepairAccount,
  emitApexQuickPresetAccount,
} from '@/utils/game/apex_config_events.ts';

type OpenWebWindowOptions = Omit<WebviewOptions, 'x' | 'y' | 'width' | 'height'> & WindowOptions;
export type RepairToolTarget = 'store' | 'onedrive' | 'icon-cache' | 'network' | 'apex-launch';
const pendingWindowCreates = new Map<string, Promise<void>>();

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
  await openWebWindow('apex-q', {
    // A new WebView receives its initial destination from the URL, before its
    // Vue event listener can be mounted. Existing windows still use the event
    // below so they navigate without being recreated.
    url: `#/apex-q?target=${encodeURIComponent(target)}`,
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
    /* A newly-created workbench reads its deterministic route target on mount. */
  }
}

async function openApexQuickPresetWindow(accountKey: string | null = null) {
  const query = accountKey ? `?account=${encodeURIComponent(accountKey)}` : '';
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

async function openRepairToolWindow(
  target: RepairToolTarget,
  accountKey?: string | null,
) {
  const definitions: Record<RepairToolTarget, {
    route: string;
    width: number;
    height: number;
    minWidth: number;
    minHeight: number;
    titleKey: string;
  }> = {
    store: {
      route: 'repair-store',
      width: 780,
      height: 680,
      minWidth: 680,
      minHeight: 540,
      titleKey: 'appRepair.targets.store',
    },
    onedrive: {
      route: 'repair-onedrive',
      width: 780,
      height: 680,
      minWidth: 680,
      minHeight: 540,
      titleKey: 'appRepair.targets.onedrive',
    },
    'icon-cache': {
      route: 'repair-icon-cache',
      width: 680,
      height: 520,
      minWidth: 580,
      minHeight: 440,
      titleKey: 'appRepair.targets.iconCache',
    },
    network: {
      route: 'repair-network',
      width: 860,
      height: 720,
      minWidth: 720,
      minHeight: 560,
      titleKey: 'appRepair.targets.network',
    },
    'apex-launch': {
      route: 'repair-apex-launch',
      width: 920,
      height: 760,
      minWidth: 760,
      minHeight: 600,
      titleKey: 'appRepair.targets.apexLaunch',
    },
  };
  const definition = definitions[target];
  const repairAccountKey = target === 'apex-launch' ? (accountKey ?? null) : null;
  const query = repairAccountKey ? `?account=${encodeURIComponent(repairAccountKey)}` : '';
  await openWebWindow(definition.route, {
    url: `#/${definition.route}${query}`,
    width: definition.width,
    height: definition.height,
    minWidth: definition.minWidth,
    minHeight: definition.minHeight,
    title: target === 'icon-cache'
      ? String(i18n.global.t('windows.iconRepair.windowTitle'))
      : target === 'apex-launch'
        ? String(i18n.global.t('apexLaunchRepair.windowTitle'))
      : String(i18n.global.t('appRepair.windowTitle', {
        target: i18n.global.t(definition.titleKey),
      })),
    decorations: false,
    center: true,
    preventOverflow: true,
  });
  if (target === 'apex-launch') {
    await emitApexLaunchRepairAccount(repairAccountKey).catch(() => undefined);
  }
}

export {
  openWebWindow,
  openAboutWindow,
  openApexQWindow,
  openApexQuickPresetWindow,
  openRepairToolWindow,
};
