import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import {createVuetify} from 'vuetify';
import {aliases, mdi} from 'vuetify/iconsets/mdi';

//Date
import DateFnsAdapter from '@date-io/date-fns';

// Apple-style tech minimalist theme
const appleLight = {
    dark: false,
    colors: {
        background: '#f5f5f7',
        surface: '#ffffff',
        'surface-bright': '#ffffff',
        'surface-variant': '#f5f5f7',
        'on-surface-variant': '#6e6e73',
        outline: 'rgba(0,0,0,0.12)',
        'outline-variant': 'rgba(0,0,0,0.08)',
        primary: '#007AFF',
        'on-primary': '#ffffff',
        'primary-container': '#e3f2fd',
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

const appleDark = {
    dark: true,
    colors: {
        background: '#000000',
        surface: '#1c1c1e',
        'surface-bright': '#2c2c2e',
        'surface-variant': '#2c2c2e',
        'on-surface-variant': '#8e8e93',
        outline: 'rgba(255,255,255,0.12)',
        'outline-variant': 'rgba(255,255,255,0.08)',
        primary: '#0a84ff',
        'on-primary': '#ffffff',
        'primary-container': '#1a1a2e',
        'on-primary-container': '#90caf9',
        secondary: '#8e8e93',
        'on-secondary': '#ffffff',
        error: '#ff453a',
        'on-error': '#ffffff',
        info: '#0a84ff',
        success: '#30d158',
        warning: '#ff9f0a',
    },
};

const vuetify = createVuetify({
    components,
    directives,
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
            mdi,
        },
    },
    defaults: {
        VDialog: {
            maxWidth: 1000,
        },
        VCard: {
            elevation: 0,
            rounded: 'lg',
        },
        VBtn: {
            rounded: 'lg',
        },
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
export default vuetify;