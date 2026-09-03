import {setAppLocale} from '@/i18n/i18n.ts';
import {
  DEFAULT_TOGGLE_LOCALE_SHORTCUT,
  useSettingsStore,
} from '@/stores/settings.ts';
import type {LocaleCode} from '@/utils/locale.ts';
import {loadApexQPrefs} from '@/stores/apex_q_preferences.ts';
import {applyDocumentLocale, resolveLocale} from '@/utils/locale.ts';
import {useBackgroundRuntimeStore} from '@/stores/background_runtime.ts';
import {
  isRegistered as isShortcutRegistered,
  unregister as unregisterGlobalShortcut,
} from '@tauri-apps/plugin-global-shortcut';
import {isShortcutRecording} from '@/utils/shortcut-recording.ts';
import {isTypingTarget, matchesAccelerator} from '@/utils/shortcut-keys.ts';
import {getCurrentWindow} from '@tauri-apps/api/window';

export {DEFAULT_TOGGLE_LOCALE_SHORTCUT};

let appListenerBound = false;
let localeTransitionQueue: Promise<unknown> = Promise.resolve();

function normalizeShortcut(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

async function runLocaleTransition(locale: LocaleCode): Promise<boolean> {
  const settings = useSettingsStore();
  const backgroundRuntime = useBackgroundRuntimeStore();
  const previousLocale = settings.locale;
  settings.setLocale(locale);

  try {
    const activated = await setAppLocale(resolveLocale(locale));
    if (!activated) {
      settings.setLocale(previousLocale);
      return false;
    }
    applyDocumentLocale(locale);
    await backgroundRuntime.setLocale(locale);
    return true;
  } catch (error) {
    settings.setLocale(previousLocale);
    try {
      const restored = await setAppLocale(resolveLocale(previousLocale));
      if (restored) applyDocumentLocale(previousLocale);
    } catch (rollbackError) {
      console.warn('failed to restore app locale:', rollbackError);
    }
    throw error;
  }
}

export function setSynchronizedAppLocale(locale: LocaleCode): Promise<boolean> {
  const transition = localeTransitionQueue.then(() => runLocaleTransition(locale));
  localeTransitionQueue = transition.then(() => undefined, () => undefined);
  return transition;
}

function toggleLocale() {
  const settings = useSettingsStore();
  const currentLocale = resolveLocale(settings.locale);
  const nextLocale = currentLocale === 'zh-CN' ? 'en-US' : 'zh-CN';
  void setSynchronizedAppLocale(nextLocale).catch((error) => {
    console.warn('failed to sync app locale:', error);
  });
}

function onAppKeyDown(e: KeyboardEvent) {
  if (e.repeat || isShortcutRecording() || isTypingTarget(e.target)) return;

  const settings = useSettingsStore();
  if (!settings.toggleLocaleShortcutEnabled) return;
  const shortcut = settings.resolvedToggleLocaleShortcut;
  const apexQPrefs = loadApexQPrefs();
  const apexQShortcut = apexQPrefs.enabled && apexQPrefs.setupDone
    ? apexQPrefs.hotkey
    : '';
  // A shared accelerator must belong to OCR; otherwise one keypress would
  // also toggle the app language in the focused WebView.
  if (normalizeShortcut(shortcut) && normalizeShortcut(shortcut) === normalizeShortcut(apexQShortcut)) {
    return;
  }
  if (!matchesAccelerator(e, shortcut)) return;

  e.preventDefault();
  e.stopPropagation();
  toggleLocale();
}

/** 卸载旧版误注册为全局的语言切换快捷键。
 * 仍依赖 global-shortcut 插件的 isRegistered/unregister；
 * 应用内快捷键走 window keydown，不再 register 全局动作。
 */
async function unregisterLegacyGlobalLocaleShortcut() {
  const settings = useSettingsStore();
  const apexQPrefs = loadApexQPrefs();
  const candidates = new Set([
    settings.resolvedToggleLocaleShortcut,
    DEFAULT_TOGGLE_LOCALE_SHORTCUT,
    settings.toggleLocaleShortcut,
    apexQPrefs.hotkey,
  ].filter(Boolean) as string[]);
  const protectedApexQShortcut = apexQPrefs.enabled === true
    && apexQPrefs.setupDone === true
    && typeof apexQPrefs.hotkey === 'string'
    ? apexQPrefs.hotkey.trim().toLowerCase()
    : '';

  for (const shortcut of candidates) {
    if (protectedApexQShortcut && shortcut.trim().toLowerCase() === protectedApexQShortcut) {
      continue;
    }
    try {
      if (await isShortcutRegistered(shortcut)) {
        await unregisterGlobalShortcut(shortcut);
      }
    } catch (err) {
      console.warn('failed to unregister legacy global locale shortcut:', shortcut, err);
    }
  }
}

/** 应用内快捷键监听；语言切换仅在应用内生效。 */
export async function applyLocaleToggleShortcut(): Promise<boolean> {
  const settings = useSettingsStore();
  settings.ensureShortcutDefaults();
  if (getCurrentWindow().label === 'main') {
    await unregisterLegacyGlobalLocaleShortcut();
  }

  if (!appListenerBound) {
    window.addEventListener('keydown', onAppKeyDown, true);
    appListenerBound = true;
  }
  return true;
}

export async function setupLocaleToggleShortcut() {
  await applyLocaleToggleShortcut();
}
