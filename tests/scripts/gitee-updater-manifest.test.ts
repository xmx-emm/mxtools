import {describe, expect, it, vi} from 'vitest';
// @ts-expect-error release automation intentionally remains dependency-free JavaScript
import {domesticManifest, publishDomesticManifest, compareVersions} from '../../scripts/gitee-updater-manifest.mjs';
// @ts-expect-error release automation intentionally remains dependency-free JavaScript
import {makeUpdaterManifest} from '../../scripts/updater-manifest.mjs';

const name = 'MxTools_0.0.8_x64_setup.exe';
const source = makeUpdaterManifest('0.0.8', 'c2lnbmF0dXJl', 'Changes');
const verified = () => new Map([
  [name, {url: `https://gitee.com/mengxin_code/mxtools/releases/download/v0.0.8/${name}`}],
  [`${name}.sig`, {text: 'c2lnbmF0dXJl\n'}],
  ['latest.json', {text: JSON.stringify(source)}],
]);

describe('Domestic signed updater feed', () => {
  it('rewrites only the URL of a verified installer and keeps the signature and version', () => {
    const result = domesticManifest('v0.0.8', verified());
    expect(result.version).toBe(source.version);
    expect(result.platforms['windows-x86_64'].signature).toBe('c2lnbmF0dXJl');
    expect(result.platforms['windows-x86_64'].url).toContain('https://gitee.com/mengxin_code/mxtools/');
    expect(domesticManifest('v0.0.7', new Map())).toBeNull();
    for (const key of [name, `${name}.sig`]) {
      const map = verified(); map.delete(key);
      expect(() => domesticManifest('v0.0.8', map)).toThrow();
    }
    const map = verified(); map.set(`${name}.sig`, {text: 'different'});
    expect(() => domesticManifest('v0.0.8', map)).toThrow();
  });

  it.each([null, []])('creates the dedicated branch for a missing file response %j', async (missing) => {
    let committed = '';
    const request = vi.fn(async (url: string, options: {method?: string; body?: {content?: string}} = {}) => {
      if (options.body?.content) committed = Buffer.from(options.body.content, 'base64').toString();
      if (url.includes('/raw/updates/')) return Buffer.from(committed);
      if (url.includes('?ref=updates')) return missing;
      return null;
    });
    expect(await publishDomesticManifest('v0.0.8', verified(), request)).toBe(true);
    const writes = request.mock.calls.filter(([, options]) => options?.method);
    expect(writes.map(([url]) => url)).toEqual([
      'https://gitee.com/api/v5/repos/mengxin_code/mxtools/branches',
      'https://gitee.com/api/v5/repos/mengxin_code/mxtools/contents/latest.json',
    ]);
    expect(JSON.parse(committed).version).toBe('0.0.8');
  });

  it('uses the current blob SHA and refuses downgrades or same-version conflicts', async () => {
    for (const version of ['0.0.7', '0.0.9', '0.0.8']) {
      const old = {...source, version};
      const request = vi.fn(async (url: string, options: {method?: string; body?: {content?: string}} = {}) => {
        if (url.includes('?ref=updates')) return {sha: 'blob-sha', content: Buffer.from(JSON.stringify(old)).toString('base64')};
        if (url.includes('/raw/updates/')) return Buffer.from(JSON.stringify(domesticManifest('v0.0.8', verified()), null, 2) + '\n');
        return options.body;
      });
      if (version === '0.0.8') await expect(publishDomesticManifest('v0.0.8', verified(), request)).rejects.toThrow('Conflicting');
      else {
        expect(await publishDomesticManifest('v0.0.8', verified(), request)).toBe(version === '0.0.7');
        const writes = request.mock.calls.filter(([, options]) => options?.method);
        if (version === '0.0.7') expect(writes[0][1]).toMatchObject({method: 'PUT', body: {sha: 'blob-sha'}});
        else expect(writes).toHaveLength(0);
      }
    }
    expect(compareVersions('0.0.10', '0.0.9')).toBe(1);
  });

  it('rechecks public delivery on idempotent retry after a previously successful commit', async () => {
    const manifest = domesticManifest('v0.0.8', verified());
    const request = vi.fn(async (url: string) => url.includes('?ref=updates')
      ? {sha: 'x', content: Buffer.from(JSON.stringify(manifest)).toString('base64')}
      : Buffer.from(JSON.stringify(manifest)));
    expect(await publishDomesticManifest('v0.0.8', verified(), request)).toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
