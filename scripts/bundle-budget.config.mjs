export const bundleBudgetsKiB = {
  // Rebaselined after deferred startup services were split in September 2026.
  // The limits retain modest headroom over the measured production report.
  startupWithLargestLocale: { raw: 550, gzip: 190 },
  javascriptChunk: { raw: 185, gzip: 68 },
  cssAsset: { raw: 270, gzip: 40 },
  allJavaScript: { raw: 1875, gzip: 635 },
  allCss: { raw: 665, gzip: 116 },
};

// Keep this deliberately broad: locale modules may be renamed while i18n is
// being split, but their source paths must continue to carry one of these
// directory names.
export const localeModulePattern = /(?:^|\/)(?:i18n|locales?)(?:\/|$)/i;
