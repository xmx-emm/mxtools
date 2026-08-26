import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const dialog = readFileSync(new URL('../../../../../../src/components/game/apex/preset/ApexOnlinePresetsDialog.vue', import.meta.url), 'utf8');
const apexPage = readFileSync(
  new URL('../../../../../../src/pages/game/ApexPage.vue', import.meta.url),
  'utf8',
);
const registry = readFileSync(
  new URL('../../../../../../src/icons/mdi-icons.ts', import.meta.url),
  'utf8',
);

describe('apex online presets contract', () => {
  it('keeps the toolbar entry behind the beta gate with the shared badge', () => {
    expect(apexPage).toMatch(
      /v-if="settings_store\.betaFeaturesEnabled"[^>]*class="apex-toolbar-control-slot apex-q-tool-slot"[\s\S]{0,400}mdi-cloud-outline/,
    );
    expect(apexPage).toContain('<ApexOnlinePresetsDialog v-model="online_presets_dialog"/>');
  });

  it('uses anonymous use flow that lands in the existing import preview transaction', () => {
    expect(dialog).toContain('onlinePresetUse(preset.id)');
    expect(dialog).toContain('parseApexConfigSnapshot(JSON.stringify(result.payload))');
    expect(dialog).toContain('apex_store.set_config_import_snapshot(snapshot)');
    expect(dialog).toContain('apex_store.open_config_import_dialog()');
  });

  it('gates publish, comment, and report on the online account state', () => {
    expect(dialog).toContain('v-if="account"');
    expect(dialog).toContain("t('apex.onlinePresets.publishNeedLogin')");
    expect(dialog).toContain("t('apex.onlinePresets.commentNeedLogin')");
    expect(dialog).toContain('apex_store.build_config_snapshot({...publish_selection})');
  });

  it('follows the shared segmented toggle contract for sorting', () => {
    expect(dialog).toMatch(
      /v-btn-toggle[\s\S]{0,400}class="game-page-segmented-toggle"[\s\S]{0,400}variant="text"/,
    );
    expect(dialog).toContain('divided');
    expect(dialog).toContain('color="primary"');
  });

  it('only references icons registered in the mdi registry', () => {
    const icons = [
      ...dialog.matchAll(/(?:icon|prepend-inner-icon|prepend-icon)="(mdi-[a-z0-9-]+)"/g),
    ].map((match) => match[1]);
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(registry, `icon ${icon} must be registered`).toContain(`'${icon}'`);
    }
    expect(registry).toContain("'mdi-cloud-outline'");
  });
});
