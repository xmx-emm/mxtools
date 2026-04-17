import {defineStore} from 'pinia';
import {isDarkStyle} from '@/utils/ui.ts';
import {DEFAULT_ACCENT, findAccent, persistAccentHint} from '@/themes';

function persistThemeHint(resolved: string) {
  try {
    localStorage.setItem('mx-theme', resolved);
  } catch (_) { /* noop */
  }
}

export const uiStyleStore = defineStore('uiStyle', {
    state: () => ({
      theme: 'system',
      accent: DEFAULT_ACCENT,
    }),
    actions: {
      setTheme(t: string) {
        this.theme = t;
        const resolved = this.themeStyle;
        persistThemeHint(resolved);
        persistAccentHint(findAccent(this.accent), resolved === 'dark');
      },
      setAccent(id: string) {
        this.accent = id;
        const isDark = this.themeStyle === 'dark';
        persistAccentHint(findAccent(id), isDark);
      },
    },
    getters: {
      themeStyle: (state): string => {
        if (state.theme === 'system') {
          return isDarkStyle() ? 'dark' : 'light';
        }
        return state.theme;
      },
      isDark(): boolean {
        return this.themeStyle === 'dark';
      },
    },
    tauri: {},
  }
);
