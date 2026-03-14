import i18n from '@/i18n/i18n';
import { useSettingsStore } from '@/stores/settings';
import { resolveLocale } from '@/utils/locale';
import {
  isRegistered as isShortcutRegistered,
  register as registerGlobalShortcut,
  unregister as unregisterGlobalShortcut,
} from '@tauri-apps/plugin-global-shortcut';

const TOGGLE_LOCALE_SHORTCUT = 'Ctrl+Alt+L';

function toggleLocale() {
  const settings = useSettingsStore();
  const currentLocale = resolveLocale(settings.locale);
  const nextLocale = currentLocale === 'zh-CN' ? 'en-US' : 'zh-CN';
  settings.setLocale(nextLocale);
  i18n.global.locale.value = nextLocale;
}

export async function setupLocaleToggleShortcut() {
  try {
    if (await isShortcutRegistered(TOGGLE_LOCALE_SHORTCUT)) {
      await unregisterGlobalShortcut(TOGGLE_LOCALE_SHORTCUT);
    }

    await registerGlobalShortcut(TOGGLE_LOCALE_SHORTCUT, (event) => {
      if (event.state !== 'Pressed') return;
      toggleLocale();
    });

    window.addEventListener(
      'beforeunload',
      () => {
        void unregisterGlobalShortcut(TOGGLE_LOCALE_SHORTCUT);
      },
      { once: true },
    );
  } catch (err) {
    console.warn('failed to register global locale shortcut:', TOGGLE_LOCALE_SHORTCUT, err);
  }
}

