import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const paletteSource = readFileSync(
  new URL('./AppCommandPalette.vue', import.meta.url),
  'utf8',
);
const routerSource = readFileSync(
  new URL('../../router.ts', import.meta.url),
  'utf8',
);

describe('command palette repair subtools', () => {
  it('indexes every repair catalog child as a direct result', () => {
    expect(paletteSource).toContain('for (const searchChild of child.searchChildren ?? [])');
    expect(paletteSource).toContain("kind: 'subtool'");

    for (const path of [
      '/repair-store',
      '/repair-onedrive',
      '/repair-icon-cache',
      '/repair-network',
    ]) {
      expect(routerSource).toContain(`path: '${path}'`);
    }
  });
});
