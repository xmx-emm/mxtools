import {describe, expect, it} from 'vitest';
// @ts-expect-error release script intentionally remains plain JavaScript
import {makeUpdaterManifest} from '../../scripts/updater-manifest.mjs';

describe('Signed NSIS update manifest', () => {
  it('targets only the stable standard installer and includes its signature', () => {
    const manifest = makeUpdaterManifest('0.0.7', 'c2lnbmF0dXJl', 'Changes');
    expect(Object.keys(manifest.platforms)).toEqual(['windows-x86_64']);
    expect(manifest.platforms['windows-x86_64']).toEqual({
      signature: 'c2lnbmF0dXJl',
      url: 'https://github.com/xmx-emm/mxtools/releases/download/v0.0.7/MxTools_0.0.7_x64_setup.exe',
    });
  });
  it('rejects missing signatures and invalid version paths', () => {
    expect(() => makeUpdaterManifest('0.0.7', '')).toThrow();
    expect(() => makeUpdaterManifest('../version', 'abc')).toThrow();
  });
  it('keeps portable and installer URLs and signatures separate', () => {
    const manifest = makeUpdaterManifest('0.0.9', 'aW5zdGFsbGVy', '', 'cG9ydGFibGU=');
    expect(manifest.platforms['windows-x86_64-portable']).toEqual({
      signature: 'cG9ydGFibGU=', url: 'https://github.com/xmx-emm/mxtools/releases/download/v0.0.9/MxTools_0.0.9_x64_portable.exe',
    });
    expect(manifest.platforms['windows-x86_64'].signature).toBe('aW5zdGFsbGVy');
    expect(() => makeUpdaterManifest('0.0.9', 'abc', '', '')).toThrow();
  });
});
