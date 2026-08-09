import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

const previewSources = [
  readSource('./launch/tips/ApexReticleColorTip.vue'),
  readSource('./video_config/tips/ApexVideoMapDetailLevelTip.vue'),
];

describe('Apex preview segmented toggle visual contract', () => {
  it('keeps both preview toggles compact and uses small child buttons', () => {
    for (const source of previewSources) {
      const toggle = source.match(
        /<v-btn-toggle[\s\S]*class="preview-type-toggle game-page-segmented-toggle"[\s\S]*<\/v-btn-toggle>/,
      )?.[0];
      expect(toggle).toBeDefined();
      expect(toggle).toMatch(/density="compact"[\s\S]*variant="text"[\s\S]*color="primary"[\s\S]*border[\s\S]*divided/);
      expect(toggle).toMatch(/<v-btn[\s\S]*size="small"[\s\S]*>/);
      expect(toggle).not.toContain('size="x-small"');
    }
  });
});
