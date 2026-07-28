import {createI18n} from 'vue-i18n';
import {createLocaleMessageLoader} from '@/i18n/locale-loader.ts';

const i18n = createI18n({
  legacy: false,
  fallbackLocale: false,
  locale: 'zh-CN',
  messages: {},
});

export type AppLocale = 'zh-CN' | 'en-US';

const localeLoader = createLocaleMessageLoader<AppLocale>({
  loaders: {
    'zh-CN': () => import('@/i18n/locales/zh-CN/index.ts'),
    'en-US': () => import('@/i18n/locales/en-US/index.ts'),
  },
  install(locale, messages) {
    i18n.global.setLocaleMessage(locale, messages);
  },
  activate(locale) {
    i18n.global.locale.value = locale;
  },
});

export const loadLocaleMessages = localeLoader.load;
export const setAppLocale = localeLoader.set;
export const isLocaleLoaded = localeLoader.isLoaded;

export default i18n;
