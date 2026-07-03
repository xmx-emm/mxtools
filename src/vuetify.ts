import {h} from 'vue';
import {createVuetify} from 'vuetify';
import {aliases, mdi} from 'vuetify/iconsets/mdi-svg';
import {resolveMdiIcon} from '@/icons/mdi-icons';
import DateFnsAdapter from '@date-io/date-fns';
import type {AccentTheme} from '@/themes';
import {deriveThemeColors, findAccent} from '@/themes';

/** 浅色主题：参考 Edge / Fluent 的柔和灰白，避免纯白刺眼 */
const appleLight = {
  dark: false,
  colors: {
    background: '#f3f3f3',
    surface: '#f8f8f8',
    'surface-bright': '#fafafa',
    'surface-variant': '#ececec',
    'on-surface': '#1f1f1f',
    'on-surface-variant': '#5a5a5a',
    outline: 'rgba(0,0,0,0.10)',
    'outline-variant': 'rgba(0,0,0,0.06)',
    primary: '#007AFF',
    'on-primary': '#ffffff',
    'primary-container': '#dfe8f4',
    'on-primary-container': '#0d47a1',
    secondary: '#8e8e93',
    'on-secondary': '#ffffff',
    error: '#ff3b30',
    'on-error': '#ffffff',
    info: '#007AFF',
    success: '#34c759',
    warning: '#ff9500',
  },
};

/** 暗色主题：参考 Edge / Fluent 分层深灰，避免纯黑发闷、控件贴底 */
const appleDark = {
  dark: true,
  colors: {
    background: '#202020',
    surface: '#2b2b2b',
    'surface-bright': '#383838',
    'surface-variant': '#333333',
    'on-surface': '#e8e8e8',
    'on-surface-variant': '#a0a0a0',
    outline: 'rgba(255,255,255,0.14)',
    'outline-variant': 'rgba(255,255,255,0.10)',
    primary: '#0a84ff',
    'on-primary': '#ffffff',
    'primary-container': '#2a3044',
    'on-primary-container': '#90caf9',
    secondary: '#98989d',
    'on-secondary': '#ffffff',
    error: '#ff453a',
    'on-error': '#ffffff',
    info: '#0a84ff',
    success: '#30d158',
    warning: '#ff9f0a',
  },
};

const vuetify = createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: appleLight,
      dark: appleDark,
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
      rounded: 'lg',
    },
    VBtn: {},
    VTextField: {
      variant: 'outlined',
      density: 'comfortable',
      rounded: 'lg',
      hideDetails: 'auto',
    },
    VSelect: {
      variant: 'outlined',
      density: 'comfortable',
      rounded: 'lg',
      hideDetails: 'auto',
    },
    VChip: {
      rounded: 'lg',
    },
  },
  date: {
    adapter: DateFnsAdapter,
  }
});

export function applyAccentTheme(accentId: string) {
  const accent: AccentTheme = findAccent(accentId);
  const lt = vuetify.theme.themes.value.light;
  const dk = vuetify.theme.themes.value.dark;
  Object.assign(lt.colors, deriveThemeColors(accent.light.primary, false));
  Object.assign(dk.colors, deriveThemeColors(accent.dark.primary, true));
}

export default vuetify;
