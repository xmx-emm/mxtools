import { createI18n } from 'vue-i18n';
import { zhCN } from '@/i18n/zh-CN';
import { enUS } from '@/i18n/en-US';

const i18n = createI18n({
  legacy: false,
  fallbackLocale: ['zh-CN', 'en-US'],
  locale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
});

export default i18n;

