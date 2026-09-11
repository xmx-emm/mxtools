import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const source = readFileSync(new URL('../../../../../../src/components/game/apex/preset/ApexConfigExportPage.vue', import.meta.url), 'utf8');
const section = readFileSync(new URL('../../../../../../src/components/game/apex/preset/ApexSnapshotSection.vue', import.meta.url), 'utf8');
describe('Apex export page', () => {
  it('uses a page with shared collapsed detail sections', () => {
    expect(source).not.toContain('<v-dialog');
    expect(source).not.toContain('machineLocalExcluded');
    expect(source).toContain('<ApexSnapshotSection');
    expect(section).toContain('<summary>');
    expect(section).toContain('icon="mdi-chevron-down"');
    expect(section).not.toMatch(/<details[^>]*\\bopen/);
    expect(section).toContain('@click.stop');
    expect(section).toContain('row.value');
    expect(section).toContain('overflow-wrap: anywhere');
  });
});
