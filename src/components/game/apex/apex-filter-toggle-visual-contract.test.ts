import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const launchSource = readFileSync(
  fileURLToPath(new URL('./launch/ApexFilter.vue', import.meta.url)),
  'utf8',
);
const videoSource = readFileSync(
  fileURLToPath(new URL('./video_config/ApexVideoConfigFilter.vue', import.meta.url)),
  'utf8',
);

describe('Apex filter toggle visual contract', () => {
  it('keeps launch and video filters on the shared compact segmented control', () => {
    for (const source of [launchSource, videoSource]) {
      expect(source).toMatch(/<v-btn-toggle[\s\S]*class="game-page-segmented-toggle"[\s\S]*density="compact"[\s\S]*color="primary"[\s\S]*variant="text"[\s\S]*border[\s\S]*divided/);
      expect(source).toMatch(/<v-btn size="small"[\s\S]*<v-btn size="small"/);
      expect(source).not.toContain('size="x-small"');
    }
  });

  it('keeps search controls reachable on narrow workspaces', () => {
    for (const source of [launchSource, videoSource]) {
      expect(source).toMatch(/class="d-flex flex-row align-center apex-launch-filters"/);
      expect(source).toMatch(/class="mx-search-field apex-filter-search"[\s\S]*:aria-label=/);
      expect(source).toMatch(/flex-wrap: wrap !important/);
      expect(source).toMatch(/@media \(max-width: 560px\)/);
      expect(source).toMatch(/flex-basis: 100%/);
      expect(source).toMatch(/max-width: none/);
      expect(source).toMatch(/display: none/);
    }
  });
});
