import { gzipSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { bundleBudgetsKiB, localeModulePattern } from './bundle-budget.config.mjs';

const root = process.cwd();
const distArgumentIndex = process.argv.indexOf('--dist');
const distArgument = distArgumentIndex >= 0 ? process.argv[distArgumentIndex + 1] : undefined;
if (distArgumentIndex >= 0 && (!distArgument || distArgument.startsWith('--'))) {
  throw new Error('Missing directory after --dist');
}
// BUNDLE_DIST_DIR makes the checker independently testable without changing
// Vite's production output directory. The command-line option wins so CI can
// override an inherited environment deterministically.
const distDir = path.resolve(root, distArgument ?? process.env.BUNDLE_DIST_DIR ?? 'dist');
const manifestPath = path.join(distDir, '.vite', 'manifest.json');
const kib = 1024;

const sizeOf = async (file) => {
  const absolutePath = path.join(distDir, file);
  const contents = await readFile(absolutePath);
  return { file, raw: contents.byteLength, gzip: gzipSync(contents).byteLength };
};

const sum = (assets) => assets.reduce((total, asset) => ({
  raw: total.raw + asset.raw,
  gzip: total.gzip + asset.gzip,
}), { raw: 0, gzip: 0 });

const toKiB = (value) => Number((value / kib).toFixed(2));
const displaySize = (size) => ({ rawKiB: toKiB(size.raw), gzipKiB: toKiB(size.gzip) });

const collectStaticFiles = (manifest, key, visited = new Set()) => {
  if (visited.has(key) || !manifest[key]) return visited;
  visited.add(key);
  for (const imported of manifest[key].imports ?? []) collectStaticFiles(manifest, imported, visited);
  return visited;
};

const filesForEntries = (manifest, entryKeys) => {
  const files = new Set();
  for (const key of entryKeys) {
    for (const moduleKey of collectStaticFiles(manifest, key)) {
      const entry = manifest[moduleKey];
      if (entry.file) files.add(entry.file);
      for (const css of entry.css ?? []) files.add(css);
    }
  }
  return files;
};

const assetRows = async (files) => Promise.all([...files].map(sizeOf));
const isJs = (file) => file.endsWith('.js');
const isCss = (file) => file.endsWith('.css');
const exceeds = (actual, limit) => actual.raw > limit.raw * kib || actual.gzip > limit.gzip * kib;

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const allManifestFiles = new Set(Object.values(manifest).flatMap((entry) => [entry.file, ...(entry.css ?? [])]).filter(Boolean));
const appEntries = Object.entries(manifest)
  .filter(([, entry]) => entry.isEntry)
  .map(([key]) => key);
const startupFiles = filesForEntries(manifest, appEntries);
const localeEntries = Object.entries(manifest)
  .filter(([key, entry]) => localeModulePattern.test(key) && (entry.isDynamicEntry || entry.isEntry))
  .map(([key]) => key);
const localeClosures = await Promise.all(localeEntries.map(async (key) => ({
  key,
  files: filesForEntries(manifest, [key]),
})));
const startupJs = await assetRows([...startupFiles].filter(isJs));
const largestLocale = (await Promise.all(localeClosures.map(async ({ key, files }) => ({
  key,
  files,
  assets: await assetRows([...files].filter(isJs)),
})))).sort((a, b) => sum(b.assets).raw - sum(a.assets).raw)[0];
const startupWithLocaleFiles = new Set([
  ...[...startupFiles].filter(isJs),
  ...[...(largestLocale?.files ?? [])].filter(isJs),
]);
const startupWithLocale = sum(await assetRows(startupWithLocaleFiles));
const allAssets = await assetRows(allManifestFiles);
const jsAssets = allAssets.filter(({ file }) => isJs(file));
const cssAssets = allAssets.filter(({ file }) => isCss(file));

const checks = [
  ['startupWithLargestLocale', 'Startup JS plus largest locale', startupWithLocale, bundleBudgetsKiB.startupWithLargestLocale],
  ...jsAssets.map((asset) => ['javascriptChunk', `JavaScript chunk ${asset.file}`, asset, bundleBudgetsKiB.javascriptChunk]),
  ...cssAssets.map((asset) => ['cssAsset', `CSS asset ${asset.file}`, asset, bundleBudgetsKiB.cssAsset]),
  ['allJavaScript', 'All JavaScript', sum(jsAssets), bundleBudgetsKiB.allJavaScript],
  ['allCss', 'All CSS', sum(cssAssets), bundleBudgetsKiB.allCss],
];
const failures = checks.filter(([, , actual, limit]) => exceeds(actual, limit));
const report = {
  budgetsKiB: bundleBudgetsKiB,
  startup: {
    files: [...startupFiles],
    javascript: displaySize(sum(startupJs)),
    largestLocale: largestLocale ? { entry: largestLocale.key, javascript: displaySize(sum(largestLocale.assets)) } : null,
    withLargestLocale: displaySize(startupWithLocale),
  },
  assets: { javascript: jsAssets.map((asset) => ({ ...asset, ...displaySize(asset) })), css: cssAssets.map((asset) => ({ ...asset, ...displaySize(asset) })) },
  totals: { javascript: displaySize(sum(jsAssets)), css: displaySize(sum(cssAssets)) },
  failures: failures.map(([category, label, actual, limit]) => ({ category, label, actual: displaySize(actual), limitKiB: limit })),
};
await writeFile(path.join(distDir, 'bundle-report.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log(`Bundle report: ${path.join(distDir, 'bundle-report.json')} (${report.startup.withLargestLocale.rawKiB} KiB raw / ${report.startup.withLargestLocale.gzipKiB} KiB gzip startup)`);
if (process.argv.includes('--check') && failures.length) {
  for (const failure of report.failures) console.error(`Budget exceeded: ${failure.label} (${failure.actual.rawKiB}/${failure.limitKiB.raw} KiB raw, ${failure.actual.gzipKiB}/${failure.limitKiB.gzip} KiB gzip)`);
  process.exitCode = 1;
}
