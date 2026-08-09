import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const source = readFileSync(new URL('./BackgroundAutostartSwitch.vue', import.meta.url), 'utf8');

describe('background autostart switch contract', () => {
  it('shows actual registration state and launch origin independently', () => {
    expect(source).toContain("runtime.autostartStatus === 'mismatch'");
    expect(source).toContain("runtime.autostartStatus === 'enabled'");
    expect(source).toContain("runtime.backgroundLaunchMode === 'autostart'");
    expect(source).toContain("runtime.backgroundLaunchMode === 'interactive'");
    expect(source).toContain(':model-value="runtime.autostartEnabled"');
  });

  it('keeps debug and pending states disabled and exposes live hints accessibly', () => {
    expect(source).toContain("t('settings.autostartDebugDisabled')");
    expect(source).toContain(':disabled="!runtime.autostartSupported || runtime.loading || runtime.applyingAutostart"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain(':aria-describedby="describedBy"');
  });
});
