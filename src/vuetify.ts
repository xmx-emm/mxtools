import {h} from 'vue';
import {createVuetify} from 'vuetify';
import {aliases, mdi} from 'vuetify/iconsets/mdi-svg';
import {resolveMdiIcon} from '@/icons/mdi-icons.ts';
import type {AccentTheme} from '@/themes.ts';
import {DEFAULT_ACCENT, deriveThemeColors, findAccent} from '@/themes.ts';

const defaultAccent = findAccent(DEFAULT_ACCENT);

/** 浅色主题：参考 Edge / Fluent 的柔和灰白，避免纯白刺眼 */
const mxLight = {
  dark: false,
  colors: {
    background: '#f4f6f8',
    surface: '#ffffff',
    'surface-bright': '#ffffff',
    'surface-variant': '#e9eef2',
    'on-surface': '#20262d',
    'on-surface-variant': '#5b6570',
    outline: 'rgba(31,42,53,0.18)',
    'outline-variant': 'rgba(31,42,53,0.10)',
    ...deriveThemeColors(defaultAccent.light.primary, false),
    secondary: '#52606d',
    'on-secondary': '#ffffff',
    error: '#c42b1c',
    'on-error': '#ffffff',
    success: '#107c10',
    warning: '#9d5d00',
  },
};

/** 暗色主题：分层拉开，侧栏/卡片/主背景可区分 */
const mxDark = {
  dark: true,
  colors: {
    background: '#17191c',
    surface: '#202328',
    'surface-bright': '#292d33',
    'surface-variant': '#30353c',
    'on-surface': '#f3f5f7',
    'on-surface-variant': '#b4bbc3',
    outline: 'rgba(255,255,255,0.16)',
    'outline-variant': 'rgba(255,255,255,0.09)',
    ...deriveThemeColors(defaultAccent.dark.primary, true),
    secondary: '#a9b3bd',
    'on-secondary': '#182027',
    error: '#ff99a4',
    'on-error': '#3b0710',
    success: '#6ccb5f',
    warning: '#fce100',
  },
};

const vuetify = createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: mxLight,
      dark: mxDark,
    },
  },
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi: {
        component: (props) => h(mdi.component, {
          ...props,
          icon: resolveMdiIcon(typeof props.icon === 'string' ? props.icon : undefined) ?? props.icon,
        }),
      },
    },
  },
  defaults: {
    VMenu: {
      contentClass: 'compact-menu',
    },
    VDialog: {
      maxWidth: 1000,
    },
    VCard: {
      elevation: 0,
      rounded: 'md',
    },
    VBtn: {},
    VTextField: {
      variant: 'outlined',
      density: 'comfortable',
      rounded: 'md',
      hideDetails: 'auto',
    },
    VSelect: {
      variant: 'outlined',
      density: 'comfortable',
      rounded: 'md',
      hideDetails: 'auto',
    },
    VChip: {
      rounded: 'md',
    },
  },
});

export function applyAccentTheme(accentId: string) {
  const accent: AccentTheme = findAccent(accentId);
  const lt = vuetify.theme.themes.value.light;
  const dk = vuetify.theme.themes.value.dark;
  Object.assign(lt.colors, deriveThemeColors(accent.light.primary, false));
  Object.assign(dk.colors, deriveThemeColors(accent.dark.primary, true));
}

export default vuetify;
