import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const pageSource = readFileSync(
  new URL('../../../../src/pages/game/RazerPollingPage.vue', import.meta.url),
  'utf8',
);

describe('Razer polling game row layout', () => {
  it('places game metadata in one row immediately before the polling-rate field', () => {
    const metaIndex = pageSource.indexOf('<div class="razer-game-meta">');
    const rateIndex = pageSource.indexOf('class="razer-game-rate"', metaIndex);

    expect(metaIndex).toBeGreaterThan(-1);
    expect(rateIndex).toBeGreaterThan(metaIndex);
    expect(pageSource).toMatch(
      /<div class="razer-game-meta">[\s\S]*?<div class="razer-game-meta-col">/,
    );
    expect(pageSource).toMatch(
      /\.razer-game-meta-col \{[^}]*flex-direction: column;/,
    );
    expect(pageSource).toMatch(
      /\.razer-game-meta span \{[^}]*font-size: 11px;/,
    );
    expect(pageSource).toMatch(/grid-template-columns: 42px minmax\(0, 1fr\) minmax\(0, 280px\) 180px;/);
  });

  it('keeps the metadata together above the polling-rate field on narrow layouts', () => {
    expect(pageSource).toMatch(
      /@container workspace \(max-width: 680px\) \{[\s\S]*?\.razer-game-meta \{[^}]*grid-column: 2;/,
    );
  });
});
