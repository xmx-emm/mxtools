import {h} from 'vue';
import {createVuetify} from 'vuetify';
import {aliases, mdi} from 'vuetify/iconsets/mdi-svg';
import {resolveMdiIcon} from '@/icons/mdi-icons.ts';
import type {AccentTheme} from '@/themes.ts';
import {deriveThemeColors, findAccent} from '@/themes.ts';

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
    primary: '#0f6cbd',
    'on-primary': '#ffffff',
    'primary-container': '#d8e9f8',
    'on-primary-container': '#07375f',
    secondary: '#52606d',
    'on-secondary': '#ffffff',
    error: '#c42b1c',
    'on-error': '#ffffff',
    info: '#0f6cbd',
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
    primary: '#4cc2ff',
    'on-primary': '#071b26',
    'primary-container': '#123d54',
    'on-primary-container': '#c9ecff',
    secondary: '#a9b3bd',
    'on-secondary': '#182027',
    error: '#ff99a4',
    'on-error': '#3b0710',
    info: '#4cc2ff',
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
