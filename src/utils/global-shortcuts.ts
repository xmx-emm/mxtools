import {setAppLocale} from '@/i18n/i18n.ts';
import {
  DEFAULT_TOGGLE_LOCALE_SHORTCUT,
  useSettingsStore,
} from '@/stores/settings.ts';
import {loadAlterQPrefs} from '@/types/alter_q.ts';
import {applyDocumentLocale, resolveLocale} from '@/utils/locale.ts';
import {
  isRegistered as isShortcutRegistered,
  unregister as unregisterGlobalShortcut,
} from '@tauri-apps/plugin-global-shortcut';
import {isShortcutRecording} from '@/utils/shortcut-recording.ts';
import {isTypingTarget, matchesAccelerator} from '@/utils/shortcut-keys.ts';
import {setTrayLocale} from '@/ipc/commands.ts';
import {getCurrentWindow} from '@tauri-apps/api/window';

export {DEFAULT_TOGGLE_LOCALE_SHORTCUT};

let appListenerBound = false;

function normalizeShortcut(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

function toggleLocale() {
  const settings = useSettingsStore();
  const currentLocale = resolveLocale(settings.locale);
  const nextLocale = currentLocale === 'zh-CN' ? 'en-US' : 'zh-CN';
  settings.setLocale(nextLocale);
  void setAppLocale(nextLocale)
    .then((activated) => {
      if (!activated) return;
      applyDocumentLocale(nextLocale);
      return setTrayLocale(nextLocale);
    })
    .catch((err) => {
      console.warn('failed to sync app locale:', err);
    });
}

function onAppKeyDown(e: KeyboardEvent) {
  if (e.repeat || isShortcutRecording() || isTypingTarget(e.target)) return;

  const settings = useSettingsStore();
  if (!settings.toggleLocaleShortcutEnabled) return;
  const shortcut = settings.resolvedToggleLocaleShortcut;
  const alterQPrefs = loadAlterQPrefs();
  const alterQShortcut = alterQPrefs.enabled && alterQPrefs.setupDone
    ? alterQPrefs.hotkey
    : '';
  // A shared accelerator must belong to OCR; otherwise one keypress would
  // also toggle the app language in the focused WebView.
  if (normalizeShortcut(shortcut) && normalizeShortcut(shortcut) === normalizeShortcut(alterQShortcut)) {
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
  const alterQPrefs = loadAlterQPrefs();
  const candidates = new Set([
    settings.resolvedToggleLocaleShortcut,
    DEFAULT_TOGGLE_LOCALE_SHORTCUT,
    settings.toggleLocaleShortcut,
    alterQPrefs.hotkey,
  ].filter(Boolean) as string[]);
  const protectedAlterQShortcut = alterQPrefs.enabled === true
    && alterQPrefs.setupDone === true
    && typeof alterQPrefs.hotkey === 'string'
    ? alterQPrefs.hotkey.trim().toLowerCase()
    : '';

  for (const shortcut of candidates) {
    if (protectedAlterQShortcut && shortcut.trim().toLowerCase() === protectedAlterQShortcut) {
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
