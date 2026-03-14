/** 支持的语言 */
export type LocaleCode = 'system' | 'zh-CN' | 'en-US';

/** 根据系统语言返回默认语言代码(用于未持久化时的初始值) */
export function getSystemLocale(): 'zh-CN' | 'en-US' {
  const lang = typeof navigator !== 'undefined' ? navigator.language : '';
  if (/^zh/i.test(lang)) return 'zh-CN';
  return 'en-US';
}

/** 将 store 中的 locale 转为实际使用的 i18n locale(system -> 系统检测) */
export function resolveLocale(locale: LocaleCode): 'zh-CN' | 'en-US' {
  if (locale === 'system') return getSystemLocale();
  return locale;
}
