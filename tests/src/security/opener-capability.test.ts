import {describe, expect, it} from 'vitest';
import permissions from '../../../src-tauri/capabilities/permissions.json';

type Permission = string | {
  identifier: string;
  allow?: Array<{url?: string}>;
};

describe('external URL capability', () => {
  it('allows only the application external-link origins and exact custom protocols', () => {
    const entry = (permissions.permissions as Permission[]).find(
      permission => typeof permission === 'object'
        && permission.identifier === 'opener:allow-open-url',
    );
    const urls = typeof entry === 'object'
      ? entry.allow?.map(item => item.url).filter((url): url is string => Boolean(url)) ?? []
      : [];

    expect(urls).not.toContain('https://*');
    expect(urls).not.toContain('http://*');
    expect(urls).toEqual([
      'https://github.com/*',
      'https://www.bilibili.com/*',
      'https://space.bilibili.com/*',
      'https://pd.qq.com/*',
      'https://learn.microsoft.com/*',
      'https://help.ea.com/*',
      'https://help.steampowered.com/*',
      'https://www.amd.com/*',
      'https://www.intel.com/*',
      'https://steamdb.info/*',
      'https://account.live.com/*',
      'https://apex.0w0.online/*',
      'steam://rungameid/*',
      'steam://validate/*',
      'steam://open/settings/downloads',
      'steam://nav/console',
      'steam://openurl/https://store.steampowered.com/app/2250040/Crosshair_V2/',
      'ms-windows-store://pdp[?]productid=9ncndwxq7c66',
      'ms-windows-store://pdp[?]productid=9nmfcl2gxn1c',
    ]);
  });
});
