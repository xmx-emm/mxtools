import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../../../src/utils/native_tooltip.ts', import.meta.url)),
  'utf8',
);

describe('native tooltip nesting contract', () => {
  it('lets a titled control replace an active row title without flickering', () => {
    expect(source).toContain('target.contains(active)');
    expect(source).toContain('target === active');
    expect(source).toContain('const target = findTitledElement(event.target);');
  });
});
