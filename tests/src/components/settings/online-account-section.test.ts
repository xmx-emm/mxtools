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

  it('keeps credentials in the browser while receiving the approved account profile', () => {
    expect(source).toContain('onlineAuthStartDeviceLogin');
    expect(source).toContain('void onlineAuthOpenVerification().catch');
    expect(source).toContain('await onlineAuthOpenVerification();');
    expect(source).not.toContain('openUrl(');
    expect(source).toContain('account.displayName || account.email');
    expect(source).not.toMatch(/type="email"|type="password"/);
  });

  it('cancels the pending device login whenever the dialog closes', () => {
    expect(source).toContain('function closeDialog()');
    expect(source).toContain('onlineAuthCancelDeviceLogin');
    expect(source).toContain('onUnmounted(stopPolling)');
  });

  it('opens only native pending-login state without accepting a WebView URL', () => {
    const commands = readFileSync(new URL('../../../../src/ipc/commands.ts', import.meta.url), 'utf8');
    const native = readFileSync(new URL('../../../../src-tauri/src/online/auth.rs', import.meta.url), 'utf8');
    const registry = readFileSync(new URL('../../../../src-tauri/src/lib.rs', import.meta.url), 'utf8');
    expect(commands).toContain("ipcInvoke<void>('online_auth_open_verification');");
    expect(native).toContain('pub fn online_auth_open_verification(app: tauri::AppHandle)');
    expect(native).toContain('validate_verification_url(&base, started.verification_uri_complete)?');
    expect(native).toContain('verification_uri_complete: verification_uri_complete.clone()');
    expect(native).toContain('let url = pending_verification_url(');
    expect(registry).toContain('            online_auth_open_verification,');
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
