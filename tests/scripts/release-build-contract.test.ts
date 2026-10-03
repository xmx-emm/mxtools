import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const buildSource = readFileSync(new URL('../../scripts/build-windows-release.mjs', import.meta.url), 'utf8');
const publishSource = readFileSync(new URL('../../scripts/publish-signed-release.ps1', import.meta.url), 'utf8');
const budgetSource = readFileSync(new URL('../../scripts/release-size-budget.mjs', import.meta.url), 'utf8');

describe('Windows release artifact contract', () => {
  it('publishes only compact installer and portable artifacts', () => {
    expect(buildSource).toContain("['安装版', 'setup'], ['便携版', 'portable']");
    expect(buildSource).not.toContain('ensureWebview2Installer');
    expect(buildSource).not.toContain('MXTOOLS_WEBVIEW2_OFFLINE_INSTALLER');
    expect(publishSource).not.toContain('_x64_offline.exe');
    expect(budgetSource).not.toContain('微软商店版');
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
});
