import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const optimizerSource = readFileSync(
  new URL('../../../../src/pages/game/GameOptimizerPage.vue', import.meta.url),
  'utf8',
);

describe('game optimizer visual contract', () => {
  it('uses the shared page shell with a fixed action band', () => {
    expect(optimizerSource).toContain('class="app-page game-optimizer-page"');
    expect(optimizerSource).toContain('class="app-page__header optimizer-header"');
    expect(optimizerSource).toContain('class="app-page__scroll"');
    expect(optimizerSource).toContain('class="app-page__content optimizer-content"');
    expect(optimizerSource).toContain('class="optimizer-actions"');
    expect(optimizerSource).not.toContain('class="optimizer page-content"');
    expect(optimizerSource).not.toContain('position: sticky');
  });

  it('marks the page as a Beta feature', () => {
    expect(optimizerSource).toContain('class="mx-beta-badge"');
    expect(optimizerSource).toContain(':title="t(\'settings.betaFeaturesHint\')"');
    expect(optimizerSource).toContain("{{ t('common.beta') }}");
  });

  it('keeps controls compact and check details readable', () => {
    expect(optimizerSource.match(/class="mx-compact-icon-button"/g)?.length).toBe(3);
    expect(optimizerSource).toContain('class="optimizer-compact-action"');
    expect(optimizerSource).toContain('class="optimizer-footer-action"');
    expect(optimizerSource).toContain('grid-template-columns: 28px 22px minmax(0, 1fr) 28px');
    expect(optimizerSource).toMatch(/\.check-row__copy b \{[^}]*overflow-wrap: anywhere;/s);
    expect(optimizerSource).toMatch(/\.check-row__copy span \{[^}]*overflow-wrap: anywhere;/s);
    expect(optimizerSource).not.toMatch(/\.check-row__copy[^}]*text-overflow: ellipsis/s);
  });

  it('does not own the independent Razer polling controls', () => {
    expect(optimizerSource).not.toContain('RazerPollingRateControl');
    expect(optimizerSource).not.toContain('razerPolling.');
    expect(optimizerSource).not.toContain('mx-razer-polling-config');
  });
});
