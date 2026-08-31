import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../../../../src/pages/game/ApexPage.vue', import.meta.url)),
  'utf8',
);
const enUs = readFileSync(
  fileURLToPath(new URL('../../../../src/i18n/locales/en-US/apex.ts', import.meta.url)),
  'utf8',
);
const zhCn = readFileSync(
  fileURLToPath(new URL('../../../../src/i18n/locales/zh-CN/apex.ts', import.meta.url)),
  'utf8',
);

describe('Apex page toolbar visual contract', () => {
  it('labels icon-only utility actions and the page-switcher region', () => {
    expect(source).toContain(':aria-label="t(\'apex.pagePresetTip\')"');
    expect(source).toContain(':aria-label="t(\'apex.configSnapshot.exportTip\')"');
    expect(source).toContain(':aria-label="t(\'apex.configSnapshot.importTip\')"');
    expect(source).toContain('class="apex-page-switcher" role="region" :aria-label="t(\'apex.pageSwitcherLabel\')"');
    expect(enUs).toContain("pageSwitcherLabel: 'Apex configuration pages'");
    expect(zhCn).toContain("pageSwitcherLabel: 'Apex 配置页面切换'");
  });

  it('keeps the shared 28px segmented-toggle contract inside the switcher', () => {
    expect(source).toMatch(/class="apex-page-type-toggle game-page-segmented-toggle"[\s\S]*?mandatory[\s\S]*?divided[\s\S]*?density="compact"[\s\S]*?color="primary"[\s\S]*?variant="text"[\s\S]*?border/);
    expect(source).toContain(':value="ApexPageTypeEnum.launch"');
    expect(source).toContain(':value="ApexPageTypeEnum.video_config"');
    expect(source).toContain(':value="ApexPageTypeEnum.game_settings"');
  });

  it('keeps page labels reachable instead of wrapping or clipping at both toolbar breakpoints', () => {
    expect(source).toMatch(/\.apex-page-switcher\s*\{[\s\S]*?overflow-x: auto/);
    expect(source).toMatch(/\.apex-page-switcher :deep\(\.apex-page-type-toggle\)\s*\{[\s\S]*?width: max-content/);
    expect(source).toMatch(/@media \(max-width: 840px\)[\s\S]*?\.apex-page-toolbar-user\s*\{[\s\S]*?flex-basis: 100%[\s\S]*?\.apex-page-toolbar-controls\s*\{[\s\S]*?flex-basis: 100%/);
    expect(source).toMatch(/@media \(max-width: 560px\)[\s\S]*?\.apex-page-switcher\s*\{[\s\S]*?flex-basis: 100%[\s\S]*?width: 100%/);
  });

  it('preserves the existing action branch topology inside the utility group', () => {
    const utilityStart = source.indexOf('class="apex-toolbar-utility-actions"');
    const switcherStart = source.indexOf('class="apex-page-switcher"');
    const utilitySource = source.slice(utilityStart, switcherStart);

    expect(utilityStart).toBeGreaterThan(-1);
    expect(switcherStart).toBeGreaterThan(utilityStart);
    expect(utilitySource).toContain('@click="open_launch_repair"');
    expect(utilitySource).toContain('@click="open_quick_preset"');
    expect(utilitySource).toContain('v-if="settings_store.betaFeaturesEnabled"');
    expect(utilitySource).toContain('@click="open_apex_q"');
    expect(utilitySource).toContain('@click="open_config_export"');
    expect(utilitySource).toContain('@click="open_config_import"');
  });

  it('uses a restrained danger hint for every reset action', () => {
    expect(source.match(/class="apex-restore-action"/g)).toHaveLength(3);
    expect(source).toMatch(
      /\.apex-restore-action :deep\(\.v-icon\)\s*\{[^}]*rgba\(var\(--v-theme-error\), 0\.68\)/s,
    );
  });
});
