import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../../../../../../src/components/game/apex/launch/ApexSelectLaunchOptions.vue', import.meta.url)),
  'utf8',
);

describe('Apex launch options animation contract', () => {
  it('anchors list-item content to prevent title drift during expansion', () => {
    expect(source).toMatch(
      /\.apex-options-list\s+:deep\(\.v-list-item__content\)\s*\{[\s\S]*?align-self:\s*flex-start;/,
    );
    expect(source).toContain('v-expand-transition');
  });
});
