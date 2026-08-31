import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../../../../../src/components/game/common/GameRefreshIconButton.vue', import.meta.url)),
  'utf8',
);

describe('GameRefreshIconButton visual contract', () => {
  it('uses the shared compact icon-button treatment without overriding its group background', () => {
    expect(source).toMatch(/class="mx-compact-icon-button"/);
    expect(source).toMatch(/icon\s*\n\s*size="small"/);
    expect(source).not.toContain('variant="text"');
  });

  it('keeps an accessible name and exposes refresh progress', () => {
    expect(source).toMatch(/:title="title"/);
    expect(source).toMatch(/:aria-label="title"/);
    expect(source).toMatch(/:aria-busy="loading \|\| undefined"/);
  });

  it('retains reduced-motion-compatible animation ownership', () => {
    expect(source).toContain('game-refresh-icon--spin');
    expect(source).toContain('@keyframes game-refresh-spin');
  });
});
