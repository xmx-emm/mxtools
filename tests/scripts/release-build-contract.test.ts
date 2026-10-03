import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const buildSource = readFileSync(new URL('../../scripts/build-windows-release.mjs', import.meta.url), 'utf8');
const publishSource = readFileSync(new URL('../../scripts/publish-signed-release.ps1', import.meta.url), 'utf8');
const budgetSource = readFileSync(new URL('../../scripts/release-size-budget.mjs', import.meta.url), 'utf8');
const cacheSource = readFileSync(new URL('../../scripts/cache-webview2-installer.mjs', import.meta.url), 'utf8');

describe('Windows release artifact contract', () => {
  it('keeps the compact default release path free of the optional Store artifact', () => {
    expect(buildSource).toContain("['安装版', 'setup'], ['便携版', 'portable']");
    expect(buildSource).not.toContain('ensureWebview2Installer');
    expect(buildSource).toContain('if (includeStore)');
    expect(publishSource).toContain("if ($env:MXTOOLS_INCLUDE_STORE -eq 'true')");
    expect(budgetSource).toContain("if (store) artifacts.push(['微软商店版'");
  });

  it('uploads future release assets one at a time in portable-first order', () => {
    const portable = publishSource.indexOf('x64_portable.exe#');
    const installer = publishSource.indexOf('x64_setup.exe#');
    const loop = publishSource.indexOf('foreach ($asset in $assets)');
    expect(portable).toBeGreaterThan(-1);
    expect(installer).toBeGreaterThan(portable);
    expect(loop).toBeGreaterThan(installer);
    expect(publishSource).toContain('& gh release upload $tag $asset');
  });

  it('keeps WebView2 behind the explicit Store opt-in and reuses the cache path', () => {
    expect(buildSource).toContain("String(process.env.MXTOOLS_INCLUDE_STORE).toLowerCase() === 'true'");
    expect(buildSource).toContain('cache-webview2-installer.mjs');
    expect(cacheSource).toContain("path.join(tauriDir, 'target', 'webview2'");
    expect(cacheSource).toContain('MicrosoftEdgeWebView2RuntimeInstallerX64.exe');
  });
});
