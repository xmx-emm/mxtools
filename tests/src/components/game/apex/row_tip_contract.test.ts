import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

const quickPreset = readSource('../../../../../src/components/game/apex/preset/ApexQuickPresetDialog.vue');
const gameSettings = readSource('../../../../../src/components/game/apex/settings/ApexGameSettings.vue');
const globalCss = readSource('../../../../../src/assets/styles/global.css');

describe('Apex row tip visual contract', () => {
  it.each([
    ['quick preset', quickPreset],
    ['game settings', gameSettings],
  ])('uses the shared quiet help affordance in %s', (_name, source) => {
    expect(source).toContain('game-page-row-tip-host');
    expect(source).toContain('mx-compact-icon-button game-page-row-tip-button');
    expect(source).toContain('icon="mdi-information-variant"');
    expect(source).not.toContain('icon="mdi-information-outline"');
  });

  it('reveals row help for pointer and keyboard input with a touch fallback', () => {
    expect(globalCss).toContain(
      '.game-page-row-tip-host:hover .game-page-row-tip-button.v-btn',
    );
    expect(globalCss).toContain(
      '.game-page-row-tip-host:focus-within .game-page-row-tip-button.v-btn',
    );
    expect(globalCss).toContain('@media (hover: none)');
  });
});
