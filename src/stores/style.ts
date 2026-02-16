import {defineStore} from 'pinia';
import {isDarkStyle} from '@/utils/ui.ts';

export const uiStyleStore = defineStore('uiStyle', {
    state: () => ({ theme: 'system' }),
    actions: {
      setTheme(t: string) {
        this.theme = t;
      }
    },
    getters: {
      themeStyle: (state): string => {
        if (state.theme === 'system') {
          if (isDarkStyle()) {
            return 'dark';
          }
          return 'light';
        }
        return state.theme;
      }
    },
    persist: true,
  }
);
