import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../../../../../src/components/game/pubg/PubgSelectLaunchOptions.vue', import.meta.url)),
  'utf8',
);
const pageSource = readFileSync(
  fileURLToPath(new URL('../../../../../src/pages/game/PubgPage.vue', import.meta.url)),
  'utf8',
);
const accountSource = readFileSync(
  fileURLToPath(new URL('../../../../../src/components/game/SteamUser.vue', import.meta.url)),
  'utf8',
);

describe('PUBG launch options visual contract', () => {
  it('keeps compact segmented controls reachable and stacked on narrow screens', () => {
    expect(source).toMatch(/\.launch-option-expand-body :deep\(\.game-page-segmented-toggle\)\s*\{[\s\S]*?width: max-content;[\s\S]*?max-width: 100%;[\s\S]*?overflow-x: auto/);
    expect(source).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.launch-option-expand-body\s*\{[\s\S]*?flex-direction: column;[\s\S]*?align-items: stretch/);
    expect(source).toContain('class="game-page-segmented-toggle"');
  });

  it('uses semantic primary state and labels icon-only actions', () => {
    expect(source).not.toContain('color: #4caf50');
    expect(source).toContain('color: rgb(var(--v-theme-primary));');
    expect(source).toContain(":aria-label=\"t('pubgLaunchOptions.ui.openLogsFolder')\"");
    expect(source).toContain(":aria-label=\"pubg_store.skip_intro_movies_disabled ? t('pubgLaunchOptions.ui.restoreIntroTip') : t('pubgLaunchOptions.ui.disableIntroTip')\"");
    expect(pageSource).toContain('<GameRefreshIconButton');
  });

  it('gives the page a stable heading/account hierarchy and a separated action band', () => {
    expect(pageSource).toContain('class="pubg-page-toolbar game-page-toolbar"');
    expect(pageSource).toContain('class="pubg-page-heading"');
    expect(pageSource).toContain("{{ t('game.pubgTitle') }}");
    expect(pageSource).toContain('class="pubg-page-account"');
    expect(pageSource).toMatch(/\.pubg-page-actions\s*\{[\s\S]*?border-top: 1px solid var\(--app-border\)/);
    expect(pageSource).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.pubg-page-toolbar\s*\{[\s\S]*?flex-direction: column/);
  });

  it('keeps the Steam account trigger compact and keyboard-labelled', () => {
    expect(accountSource).toContain('class="steam-user-avatar"');
    expect(accountSource).toContain('size="32"');
    expect(accountSource).toContain(':aria-label="gameStore.active_steam_user?.name || t(\'steam.emptyUserList\')"');
    expect(accountSource).not.toContain("accountHint: 'Steam id 578080'");
  });
});
