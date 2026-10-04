import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const source = readFileSync(new URL(
  '../../../../../../src/components/game/apex/preset/ApexQuickPresetDialog.vue',
  import.meta.url,
), 'utf8');

describe('Apex quick preset sensitivity typography', () => {
  it('uses the same compact label typography as the other option checkboxes', () => {
    const sensitivityLabelRule = source.slice(
      source.indexOf('.quick-preset-number-setting-row .quick-preset-section-checkbox :deep(.v-label)'),
      source.indexOf('\n}', source.indexOf('.quick-preset-number-setting-row .quick-preset-section-checkbox :deep(.v-label)')) + 2,
    );

    expect(sensitivityLabelRule).toMatch(/font-size:\s*12px;/);
    expect(sensitivityLabelRule).toMatch(/font-weight:\s*400;/);
    expect(sensitivityLabelRule).toMatch(/line-height:\s*1\.4;/);
    expect(sensitivityLabelRule).toMatch(/white-space:\s*nowrap;/);
  });

  it('keeps the sensitivity help text behind the shared hover tip button', () => {
    expect(source).toContain('class="quick-preset-number-setting-row game-page-row-tip-host"');
    expect(source).toContain(":title=\"t('apexLaunchOptions.ui.rightClickTip')\"");
    expect(source).toContain('@contextmenu.prevent="show_game_setting_tip(\'mouseSensitivity\')"');
    expect(source).not.toContain('<span class="quick-preset-hint">{{ t(\'apexQuickPreset.mouseSensitivityHint\') }}</span>');
    expect(source).toContain(':title="t(\'apexQuickPreset.mouseSensitivityHint\')"');
    expect(source).toContain('class="mx-compact-icon-button game-page-row-tip-button"');
    expect(source).toContain(":aria-label=\"t('apexGameSettings.openTip', {setting: t('apexQuickPreset.mouseSensitivity')})\"");
  });
});
