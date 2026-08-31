import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

const routerSource = source('../../../../src/router.ts');
const apexPageSource = source('../../../../src/pages/game/ApexPage.vue');
const repairPageSource = source('../../../../src/pages/game/ApexLaunchRepairPage.vue');
const catalogSource = source('../../../../src/pages/windows/AppRepairPage.vue');
const paletteSource = source('../../../../src/components/command/AppCommandPalette.vue');

describe('Apex Launch Repair beta contract', () => {
  it('gates toolbar, catalog, command search, and direct routing', () => {
    expect(apexPageSource).toMatch(
      /v-if="settings_store\.betaFeaturesEnabled"[^>]*apex-q-tool-slot[\s\S]{0,500}open_launch_repair/,
    );
    expect(catalogSource).toContain(
      'items: group.items.filter(item => !item.beta || settingsStore.betaFeaturesEnabled)',
    );
    expect(paletteSource).toContain(
      'if (searchChild.beta && !settingsStore.betaFeaturesEnabled) continue;',
    );
    expect(routerSource).toMatch(
      /path: '\/repair-apex-launch',[\s\S]{0,180}beta: true,[\s\S]{0,120}betaFallback: '\/app_repair'/,
    );
    expect(routerSource).toContain('const routeRequiresBeta = to.meta.beta === true;');
  });

  it('shows the shared Beta badge at every visible entry and on the page', () => {
    expect(apexPageSource).toMatch(/open_launch_repair[\s\S]{0,400}mx-beta-badge/);
    expect(catalogSource).toContain('v-if="item.beta"');
    expect(catalogSource).toContain('class="mx-beta-badge"');
    expect(repairPageSource).toContain('class="apex-launch-repair-summary__title"');
    expect(repairPageSource).toContain("{{ t('common.beta') }}");
  });
});
