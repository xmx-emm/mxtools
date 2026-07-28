export const bundleBudgetsKiB = {
  startupWithLargestLocale: { raw: 525, gzip: 205 },
  javascriptChunk: { raw: 185, gzip: 68 },
  cssAsset: { raw: 270, gzip: 40 },
  allJavaScript: { raw: 1500, gzip: 525 },
  allCss: { raw: 580, gzip: 105 },
};

// Keep this deliberately broad: locale modules may be renamed while i18n is
// being split, but their source paths must continue to carry one of these
// directory names.
export const localeModulePattern = /(?:^|\/)(?:i18n|locales?)(?:\/|$)/i;
