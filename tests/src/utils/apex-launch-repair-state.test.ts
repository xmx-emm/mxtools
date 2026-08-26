import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {
  APEX_LAUNCH_REPAIR_CHECK_IDS,
  apexLaunchRepairLoadFailurePhase,
  apexLaunchRepairLoadPhase,
  INITIAL_APEX_LAUNCH_REPAIR_PHASE,
} from '@/utils/apex-launch-repair-state.ts';

const pageSource = readFileSync(
  new URL('../../../src/pages/game/ApexLaunchRepairPage.vue', import.meta.url),
  'utf8',
);
const apexPageSource = readFileSync(
  new URL('../../../src/pages/game/ApexPage.vue', import.meta.url),
  'utf8',
);
const backendSource = readFileSync(
  new URL('../../../src-tauri/src/game/apex_launch_repair.rs', import.meta.url),
  'utf8',
);

describe('Apex launch repair state and contracts', () => {
  it('starts idle and scans only after an explicit action', () => {
    expect(INITIAL_APEX_LAUNCH_REPAIR_PHASE).toBe('idle');
    expect(apexLaunchRepairLoadPhase(false)).toBe('scanning');
    const mountedBlock = pageSource.split('onMounted(async () => {')[1]?.split('});')[0] ?? '';
    expect(mountedBlock).not.toContain('await scan(');
    expect(pageSource).toContain("t('apexLaunchRepair.startCheck')");
  });

  it('keeps the old report visible during refresh and after refresh failure', () => {
    expect(apexLaunchRepairLoadPhase(true)).toBe('refreshing');
    expect(apexLaunchRepairLoadFailurePhase(true)).toBe('ready');
    expect(pageSource).toContain("phase.value === 'scanning' ? workingResults.value : results.value");
  });

  it('runs ten allowlisted checks sequentially', () => {
    expect(APEX_LAUNCH_REPAIR_CHECK_IDS).toHaveLength(10);
    expect(pageSource).toContain('for (const checkId of APEX_LAUNCH_REPAIR_CHECK_IDS)');
    expect(pageSource).toContain('await diagnoseApexLaunchRepairCheck');
    const backendPositions = APEX_LAUNCH_REPAIR_CHECK_IDS.map(id => backendSource.indexOf(`"${id}"`));
    expect(backendPositions.every(position => position >= 0)).toBe(true);
    expect(backendPositions).toEqual([...backendPositions].sort((a, b) => a - b));
  });

  it('defaults batch actions to unchecked and keeps config reset separate', () => {
    expect(pageSource).toContain('const selectedActions = ref<string[]>([])');
    expect(pageSource).toContain("action.mode === 'batch'");
    expect(pageSource).toContain("actionId === 'reset_apex_config'");
    expect(pageSource).toContain('await apexStore.reset_apex_to_defaults()');
  });

  it('places the repair icon before the quick-preset button', () => {
    expect(apexPageSource.indexOf('mdi-auto-fix')).toBeGreaterThan(-1);
    expect(apexPageSource.indexOf('mdi-auto-fix')).toBeLessThan(
      apexPageSource.indexOf('mdi-lightning-bolt-outline'),
    );
  });

  it('keeps one fixed workbench while only the flat check list scrolls', () => {
    expect(pageSource).toContain('class="apex-launch-repair-workbench"');
    expect(pageSource).toMatch(
      /\.apex-launch-repair-window__body\s*\{[^}]*overflow: hidden;/s,
    );
    expect(pageSource).toMatch(
      /\.apex-launch-repair-workbench\s*\{[^}]*flex: 1 1 auto;[^}]*min-height: 0;/s,
    );
    expect(pageSource).toMatch(
      /\.apex-launch-repair-checks\s*\{[^}]*overflow-y: auto;/s,
    );
    expect(pageSource.match(/overflow-y: auto;/g)).toHaveLength(1);
    expect(pageSource).toMatch(
      /\.apex-launch-repair-footer\s*\{[^}]*flex: 0 0 auto;/s,
    );
    const checkStyle = pageSource.split('.apex-launch-repair-check {')[1]?.split('}')[0] ?? '';
    expect(checkStyle).toContain('border-bottom: 1px solid var(--app-border)');
    expect(checkStyle).not.toContain('border-radius');
  });

  it('uses compact commands and shows live details only after a result exists', () => {
    expect(pageSource).toMatch(
      /\.apex-launch-repair-command\.v-btn\s*\{[^}]*--app-control-height-action/s,
    );
    expect(pageSource).toContain('class="apex-launch-repair-summary__status-icon"');
    expect(pageSource).toContain('class="apex-launch-repair-check__status"');
    expect(pageSource).toContain('v-if="resultFor(checkId)" class="apex-launch-repair-check__detail"');
    expect(pageSource).not.toContain('size="44"');

    const dialogSource = pageSource.slice(pageSource.indexOf('<v-dialog'));
    expect(dialogSource.match(/<v-btn/g)).toHaveLength(6);
    expect(dialogSource.match(/class="apex-launch-repair-command"/g)).toHaveLength(6);

    for (const status of ['checking', 'pass', 'info', 'warning', 'error']) {
      expect(pageSource).toContain(`.apex-launch-repair-check__status--${status}`);
    }
  });
});
