import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

const dialogSource = readSource('../../../../../../src/components/game/apex/preset/ApexQuickPresetDialog.vue');
const windowSource = readSource('../../../../../../src/views/ApexQuickPresetWindowView.vue');
const presetActionsSource = readSource('../../../../../../src/stores/game/apex/actions_preset.ts');

describe('Apex quick preset visual contract', () => {
  it('uses one framed workbench with a single settings scroll owner and fixed actions', () => {
    const workbenchSource = dialogSource.slice(
      dialogSource.indexOf('<div class="quick-preset-shell--window">'),
      dialogSource.indexOf('<v-dialog'),
    );

    expect(workbenchSource).toContain('class="quick-preset-workbench"');
    expect(workbenchSource).not.toContain('<v-card');
    expect(workbenchSource).not.toContain(':title="t(\'apexQuickPreset.title\')"');
    expect(dialogSource).toMatch(
      /\.quick-preset-scroll\s*\{[^}]*overflow-y: auto;/s,
    );
    expect(dialogSource.match(/overflow-y: auto;/g)).toHaveLength(1);
    expect(dialogSource).toMatch(
      /\.quick-preset-footer\s*\{[^}]*flex: 0 0 auto;/s,
    );
    expect(dialogSource).toMatch(
      /\.quick-preset-action\.v-btn\s*\{[^}]*--app-control-height-action/s,
    );
  });

  it('keeps preset choices reachable and aligns window states with the workbench', () => {
    expect(dialogSource.match(/class="quick-preset-segment-scroll"/g)).toHaveLength(2);
    expect(dialogSource).toContain('overflow-x: auto;');
    expect(dialogSource).toContain('width: max-content;');
    expect(dialogSource).toContain('flex-wrap: nowrap !important;');
    expect(dialogSource).not.toContain('.graphics-preset-toggle :deep(.v-btn-group)');
    expect(dialogSource.match(/class="quick-preset-action"/g)).toHaveLength(4);
    expect(windowSource).toContain('class="quick-preset-window-state"');
    expect(windowSource).toContain('class="quick-preset-window-retry"');
    expect(windowSource).toMatch(
      /\.quick-preset-window-body\s*\{[^}]*padding: 0;/s,
    );
  });

  it('accepts a successfully loaded empty config after reset', () => {
    expect(dialogSource).not.toMatch(
      /video_config_load_status !== 'ready'\s*\|\|\s*Object\.keys\(apex_store\.video_config_values\)\.length === 0/,
    );
    expect(presetActionsSource).not.toMatch(
      /video_config_load_status !== 'ready'\s*\|\|\s*Object\.keys\(this\.video_config_values\)\.length === 0/,
    );
    expect(presetActionsSource).toContain(
      "const requiredBindingCommands = ['+zoom', '+forward', '+jump'];",
    );
  });
});
