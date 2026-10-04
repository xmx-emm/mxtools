import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const source = readFileSync(new URL(
  '../../../../../../src/components/game/apex/preset/ApexQuickPresetDialog.vue',
  import.meta.url,
), 'utf8');

describe('Apex quick preset sensitivity layout', () => {
  it('keeps the value control in the same second column as binding shortcuts', () => {
    expect(source).toContain('<div class="quick-preset-number-setting-label">');
    expect(source).toContain('<div class="quick-preset-number-setting-control">');

    const numberRowRule = source.slice(
      source.indexOf('.quick-preset-number-setting-row {'),
      source.indexOf('\n}', source.indexOf('.quick-preset-number-setting-row {')) + 2,
    );

    expect(numberRowRule).toMatch(/display:\s*grid;/);
    expect(numberRowRule).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*140px\);/);
    expect(numberRowRule).toMatch(/width:\s*min\(100%,\s*480px\);/);
    expect(source).toMatch(/\.preset-binding-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*140px\);/);
  });
});
