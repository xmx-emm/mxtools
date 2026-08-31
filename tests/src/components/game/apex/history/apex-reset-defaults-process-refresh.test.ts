import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../../../../../../src/components/game/apex/history/ApexResetDefaultsDialog.vue', import.meta.url)),
  'utf8',
);

describe('Apex reset process refresh contract', () => {
  it('refreshes process status while the dialog is open and stops with its lifecycle', () => {
    expect(source).toContain('const PROCESS_REFRESH_MS = 1500');
    expect(source).toContain('scheduleProcessRefresh(expectedGeneration)');
    expect(source).toContain('refreshTimer = setTimeout');
    expect(source).toContain('() => apexStore.launcher_selection_key');
    expect(source).toContain('onUnmounted(() => stopProcessRefresh())');
  });

  it('fails closed when status detection fails', () => {
    expect(source).toContain("checkFailed.value = true");
    expect(source).toContain("t('apex.history.processCheckFailed')");
    expect(source).toContain(':disabled="!processStatusReady || checkFailed || !!runningProcesses.length || !apexStore.active_apex_account || forceClosingLauncher"');
    expect(source).toContain('thoroughlyKillSteam');
    expect(source).toContain('forceCloseLauncher');
  });
});
