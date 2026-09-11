import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const component = readFileSync(
  fileURLToPath(new URL('../../../../../src/components/game/common/GameVersionStatus.vue', import.meta.url)),
  'utf8',
);
const globalStyles = readFileSync(
  fileURLToPath(new URL('../../../../../src/assets/styles/global.css', import.meta.url)),
  'utf8',
);

describe('GameVersionStatus tooltip contract', () => {
  it('keeps complete build identities on one line without the shared width cap', () => {
    expect(component).toMatch(/content-class="mx-tooltip game-version-tooltip"/);
    expect(component).toMatch(/max-width="none"/);
    expect(globalStyles).toMatch(/\.game-version-tooltip\s*\{\s*max-width:\s*none;\s*overflow-wrap:\s*normal;\s*white-space:\s*nowrap;/);
  });
});
