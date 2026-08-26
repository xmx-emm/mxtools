import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const source = readFileSync(new URL('../../../../src/components/settings/OnlineAccountSection.vue', import.meta.url), 'utf8');
const settingsView = readFileSync(
  new URL('../../../../src/views/SettingsView.vue', import.meta.url),
  'utf8',
);
const registry = readFileSync(new URL('../../../../src/icons/mdi-icons.ts', import.meta.url), 'utf8');

describe('online account section contract', () => {
  it('stays behind the beta gate inside the settings general panel', () => {
    expect(settingsView).toContain('<OnlineAccountSection v-if="settingsStore.betaFeaturesEnabled"/>');
  });

  it('never collects credentials in the app: login flows through the browser device page', () => {
    expect(source).toContain('onlineAuthStartDeviceLogin');
    expect(source).toContain('openUrl(started.verificationUriComplete)');
    expect(source).not.toMatch(/type="email"|type="password"/);
  });

  it('cancels the pending device login whenever the dialog closes', () => {
    expect(source).toContain('function closeDialog()');
    expect(source).toContain('onlineAuthCancelDeviceLogin');
    expect(source).toContain('onUnmounted(stopPolling)');
  });

  it('keeps browser preview truthful without native IPC calls', () => {
    expect(source).toContain("ref<AccountState>(isTauriRuntime ? 'checking' : 'browser')");
    expect(source).toContain("t('settings.onlineAccountBrowserOnly')");
    expect(source).toContain('if (isTauriRuntime) void refreshAccount();');
  });

  it('only references icons that exist in the mdi registry', () => {
    const icons = [...source.matchAll(/(?:icon|prepend-icon)="(mdi-[a-z0-9-]+)"/g)].map(
      (match) => match[1],
    );
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      expect(registry, `icon ${icon} must be registered`).toContain(`'${icon}'`);
    }
  });

  it('honors slow-down polling and terminal poll states', () => {
    expect(source).toContain("result.status === 'slowDown'");
    expect(source).toContain("result.status === 'approved'");
    expect(source).toContain("loginStage.value = result.status === 'denied' ? 'denied' : 'expired'");
  });
});
