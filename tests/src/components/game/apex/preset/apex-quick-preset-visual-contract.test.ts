import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}

const dialogSource = readSource('../../../../../../src/components/game/apex/preset/ApexQuickPresetDialog.vue');
const windowSource = readSource('../../../../../../src/views/ApexQuickPresetWindowView.vue');
const presetActionsSource = readSource('../../../../../../src/stores/game/apex/actions_preset.ts');
const apexPageSource = readSource('../../../../../../src/pages/game/ApexPage.vue');

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
    expect(dialogSource.match(/class="quick-preset-action"/g)).toHaveLength(2);
    expect(dialogSource).toContain('class="quick-preset-action quick-preset-refresh"');
    expect(dialogSource).toContain('icon="mdi-refresh"');
    expect(dialogSource).toContain('@click="refresh_config()"');
    expect(dialogSource).toContain('listenApexConfigChanged(() => refresh_config(true))');
    expect(dialogSource).toContain('void refresh_if_config_changed();');
    expect(dialogSource).toContain('<CloseRunningProcessesDialog');
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
    expect(dialogSource).toContain(
      'launch_options.value = initLaunchOptionsForDialog(apex_store.options_selection)',
    );
    expect(dialogSource).toContain(
      'video_options.value = initVideoOptionsForDialog(apex_store.video_config_values)',
    );
    expect(dialogSource).toContain(
      'game_setting_options.value = initGameSettingOptionsForDialog(',
    );
    expect(dialogSource).not.toContain('ref<Record<string, boolean>>(buildDefaultLaunchOptions())');
    expect(dialogSource).not.toContain('ref<Record<string, boolean>>(buildDefaultVideoOptions())');
    expect(dialogSource).not.toContain('ref<Record<string, boolean>>(buildDefaultGameSettingOptions())');
  });

  it('shows quick-preset completion in the main Apex window', () => {
    expect(presetActionsSource).toContain("notification: 'quickPresetApplied'");
    expect(presetActionsSource).not.toContain("toast.success('apexQuickPreset.applySuccess')");
    expect(apexPageSource).toContain("toast.success('apexQuickPreset.applySuccess')");
    expect(apexPageSource).toContain('shown_external_notifications.has(payload.revision)');
    expect(apexPageSource).not.toContain('pendingApexConfigChange');
    expect(apexPageSource).not.toContain('markApexConfigChangeSeen');
    expect(apexPageSource).toContain('show_external_config_notification(payload);');
  });

  it('explains that occupied binding inputs are replaced', () => {
    expect(dialogSource).toContain("t('apexQuickPreset.bindingReplacementHint')");
    expect(dialogSource).toContain('class="preset-binding-replacement-hint"');
    expect(presetActionsSource).toContain("const aimCommands = ['+zoom', '+toggle_zoom'];");
    expect(dialogSource).toContain('v-if="binding_settings_missing"');
    expect(dialogSource).toContain("t('apexQuickPreset.bindingSettingsMissing')");
    expect(dialogSource).toContain('binding_settings_missing"');
    // 缺失/不完整时不再阻塞:后端从内置默认模板初始化完整键位,成功后提示
    expect(presetActionsSource).not.toContain("throw new Error('apexQuickPreset.bindingSettingsMissing')");
    expect(dialogSource).toContain("toast.info('apexQuickPreset.bindingDefaultsGenerated'");
    expect(presetActionsSource).not.toContain('for (const target of targets) createPresetBinding(store, target);');
    expect(dialogSource).not.toMatch(
      /\.preset-binding-summary\s*\{[^}]*color:\s*rgba\(var\(--v-theme-on-surface\),\s*0\.56\)/s,
    );
    expect(dialogSource).toMatch(
      /\.preset-binding-row kbd\s*\{[^}]*color:\s*rgba\(var\(--v-theme-on-surface\),\s*0\.76\)/s,
    );
  });
});
