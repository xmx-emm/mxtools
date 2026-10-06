import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const pageSource = readFileSync(
  fileURLToPath(new URL('../../../../src/pages/game/ApexPage.vue', import.meta.url)),
  'utf8',
);

describe('Apex version status scope contract', () => {
  it('uses one build-level status for all three Apex configuration pages', () => {
    expect(pageSource.match(/<GameVersionStatus game="apex"/g)).toHaveLength(3);
    expect(pageSource).not.toContain('<GameVersionStatus game="apex" scope="launch"');
  });
});
