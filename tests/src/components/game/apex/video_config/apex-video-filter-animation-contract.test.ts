import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../../../../../../src/components/game/apex/video_config/ApexVideoConfig.vue', import.meta.url)),
  'utf8',
);

describe('Apex video filter animation contract', () => {
  it('animates filtered rows and preserves sticky category wrappers', () => {
    expect(source).toContain('<TransitionGroup');
    expect(source).toContain('name="apex-video-filter-list"');
    expect(source).toContain(':class="{\'apex-video-category-entry\': !isApexVideoConfigImpl(item)}"');
    expect(source).toContain('.apex-video-filter-list-move,');
    expect(source).toContain('opacity var(--app-motion-base) var(--app-ease-standard)');
    expect(source).toMatch(
      /\.apex-video-category-entry\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/s,
    );
  });
});
