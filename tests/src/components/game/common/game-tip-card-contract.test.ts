import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../../../../../src/components/game/common/GameTipCard.vue', import.meta.url)),
  'utf8',
);

describe('Shared game tip card scrolling contract', () => {
  it('keeps the title and close action outside the scrolling body', () => {
    const appendSlot = source.indexOf('<template #append>');
    const scrollRegion = source.indexOf('<div class="game-tip-scroll-region">');

    expect(source).toContain('class="game-tip-card"');
    expect(appendSlot).toBeGreaterThan(-1);
    expect(scrollRegion).toBeGreaterThan(appendSlot);
    expect(source).toContain('max-height: calc(100dvh - 32px)');
    expect(source).toContain('overflow-y: auto');
    expect(source).toContain('.game-tip-card.v-card > .game-tip-header.v-card-item');
  });
});
