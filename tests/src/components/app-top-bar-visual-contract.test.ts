import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../../../src/components/AppTopBar.vue', import.meta.url)),
  'utf8',
);

describe('App top bar visual contract', () => {
  it('keeps the quick-open command compact within the title bar', () => {
    const start = source.indexOf('.title-bar-command {');
    const block = source.slice(start, source.indexOf('}', start) + 1);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(block).toContain('height: 24px;');
    expect(block).toContain('min-height: 24px;');
  });
});
