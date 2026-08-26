import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const categoryHomeSource = readFileSync(
  new URL('../../../../src/components/navigation/ToolCategoryHome.vue', import.meta.url),
  'utf8',
);
const gamePageSource = readFileSync(
  new URL('../../../../src/pages/GamePage.vue', import.meta.url),
  'utf8',
);
const routerSource = readFileSync(
  new URL('../../../../src/router.ts', import.meta.url),
  'utf8',
);

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  return source.slice(startIndex, source.indexOf(end, startIndex));
}

describe('tool category home visual contract', () => {
  it('separates Beta markers from neutral support labels', () => {
    expect(categoryHomeSource).toContain('v-if="item.beta"');
    expect(categoryHomeSource).toContain('class="mx-beta-badge"');
    expect(categoryHomeSource).toContain(':title="item.beta.hint"');
    expect(categoryHomeSource).toContain('v-else-if="item.badge" class="tool-hub-item__badge"');
  });

  it('uses the workspace transition without staggered item animations', () => {
    expect(categoryHomeSource).not.toContain('app-reveal');
    expect(categoryHomeSource).not.toContain('--tool-item-delay');
    expect(categoryHomeSource).not.toContain('--tool-guide-delay');
    expect(categoryHomeSource).not.toContain('@keyframes tool-hub-item-enter');
    expect(categoryHomeSource).not.toContain('@keyframes tool-hub-guide-enter');
    expect(gamePageSource).toContain("{count: gameItems.length}");
  });

  it('keeps Game Checkup public while gating only the independent Razer tool', () => {
    expect(gamePageSource).toContain("path: '/razer_polling'");
    expect(routerSource).toContain("path: '/razer_polling'");

    const gameItems = sourceBetween(
      gamePageSource,
      'const gameItems = computed(() => ([',
      '].filter(item =>',
    );
    const gameRoutes = sourceBetween(
      routerSource,
      'const game_tools: ToolChild[] = [',
      '];\nconst windows_tools',
    );
    const gameOptimizerCard = sourceBetween(
      gameItems,
      "path: '/game_optimizer'",
      "path: '/apex'",
    );
    const gameOptimizerRoute = sourceBetween(
      gameRoutes,
      "path: '/game_optimizer'",
      "path: '/apex'",
    );
    const razerCard = sourceBetween(
      gamePageSource,
      "path: '/razer_polling'",
      '].filter(item =>',
    );
    const razerRoute = sourceBetween(
      routerSource,
      "path: '/razer_polling'",
      '];\nconst windows_tools',
    );

    expect(gameOptimizerCard).not.toContain('beta:');
    expect(gameOptimizerRoute).not.toContain('beta:');
    expect(gameItems.trimEnd()).toMatch(/path: '\/razer_polling'[\s\S]*},$/);
    expect(gameRoutes.trimEnd()).toMatch(/path: '\/razer_polling'[\s\S]*},$/);
    expect(gamePageSource).toContain("import RazerIcon from '@/components/icons/RazerIcon.vue';");
    expect(routerSource).toContain("import RazerIcon from '@/components/icons/RazerIcon.vue';");
    expect(razerCard).toContain('iconComponent: RazerIcon');
    expect(razerRoute).toContain('iconComponent: markRaw(RazerIcon)');
    expect(razerCard).not.toContain("icon: 'mdi-mouse'");
    expect(razerRoute).not.toContain("icon: 'mdi-mouse'");
    expect(razerCard).toContain('beta: {');
    expect(razerCard).toContain("label: t('common.beta')");
    expect(razerCard).toContain("hint: t('settings.betaFeaturesHint')");
    expect(razerRoute).toContain('beta: true');

    expect(gamePageSource).toMatch(
      /\.filter\(item => item\.path !== '\/razer_polling'\s*\|\|\s*settingsStore\.betaFeaturesEnabled\)/s,
    );
    expect(gamePageSource).not.toContain("item.path !== '/game_optimizer'");
    expect(routerSource).toContain('child.beta');
    expect(routerSource).toContain('!settings.betaFeaturesEnabled');
  });
});
