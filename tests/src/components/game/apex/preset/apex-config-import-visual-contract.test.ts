import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../../../../../../src/components/game/apex/preset/ApexConfigImportDialog.vue', import.meta.url)),
  'utf8',
);

describe('Apex config import visual contract', () => {
  it('uses low-emphasis device guidance instead of an alert', () => {
    expect(source).toContain('class="config-import-device-note"');
    expect(source).toContain('mdi-information-outline');
    expect(source).not.toContain('<v-alert');
    expect(source).toMatch(/\.config-import-device-note\s*\{[\s\S]*font-size: 10\.5px/);
    expect(source).toMatch(/color: rgba\(var\(--v-theme-on-surface\), 0\.5\)/);
  });

  it('keeps previews compact and subordinate to their selection labels', () => {
    expect(source).toMatch(/\.preview-box\s*\{[\s\S]*margin: 2px 0 8px 30px/);
    expect(source).toMatch(/\.preview-summary\s*\{[\s\S]*font-size: 10\.5px/);
    expect(source).toMatch(/\.preview-code\s*\{[\s\S]*font-size: 10\.5px/);
  });
});
