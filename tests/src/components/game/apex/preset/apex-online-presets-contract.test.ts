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
    expect(dialog).toContain("await openApexConfigSnapshotWindow('import', undefined, apex_store.launcher_selection_key, JSON.stringify(snapshot))");
  });

  it('gates publish, comment, and report on the online account state', () => {
    expect(dialog).toContain('v-if="account"');
    expect(dialog).toContain("t('apex.onlinePresets.publishNeedLogin')");
    expect(dialog).toContain("t('apex.onlinePresets.commentNeedLogin')");
    expect(dialog).toContain('apex_store.build_config_snapshot({...publish_selection})');
  });

  it('supports one-level replies through the server parentId contract', () => {
    expect(dialog).toContain('function start_reply(comment: OnlinePresetComment)');
    expect(dialog).toContain("parentId: reply_to_id.value || undefined");
    expect(dialog).toContain("t('apex.onlinePresets.replyAction')");
    expect(dialog).toContain("t('apex.onlinePresets.replying')");
  });

  it('ignores stale list responses when filters or dialog state change', () => {
    expect(dialog).toContain('let list_generation = 0;');
    expect(dialog).toContain('let list_request_id = 0;');
    expect(dialog).toContain('if (generation !== list_generation || request_id !== list_request_id) return;');
    expect(dialog).toContain('if (request_id === list_request_id) loading.value = false;');
  });

  it('does not attach an older comment response to a newly expanded preset', () => {
    expect(dialog).toContain('let comments_request_id = 0;');
    expect(dialog).toContain('if (request_id !== comments_request_id || expanded_id.value !== preset.id) return;');
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
