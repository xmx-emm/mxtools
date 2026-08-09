import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {
  INITIAL_NETWORK_REPAIR_PHASE,
  NETWORK_REPAIR_CHECK_IDS,
  networkRepairLoadFailurePhase,
  networkRepairLoadPhase,
} from './network-repair-state.ts';

const pageSource = readFileSync(
  new URL('../pages/windows/NetworkRepairPage.vue', import.meta.url),
  'utf8',
);
const backendSource = readFileSync(
  new URL('../../src-tauri/src/network_repair.rs', import.meta.url),
  'utf8',
);

describe('network repair view state', () => {
  it('starts idle and only enters scanning for the first explicit check', () => {
    expect(INITIAL_NETWORK_REPAIR_PHASE).toBe('idle');
    expect(networkRepairLoadPhase(false)).toBe('scanning');
    expect(pageSource).not.toContain('onMounted(');
    expect(pageSource).toContain("t('networkRepair.startCheck')");
  });

  it('keeps existing results visible while refreshing and after refresh failure', () => {
    expect(networkRepairLoadPhase(true)).toBe('refreshing');
    expect(networkRepairLoadFailurePhase(true)).toBe('ready');
  });

  it('runs the seven real diagnostic checks sequentially instead of estimating progress', () => {
    expect(NETWORK_REPAIR_CHECK_IDS).toHaveLength(7);
    expect(pageSource).toContain('for (const checkId of NETWORK_REPAIR_CHECK_IDS)');
    expect(pageSource).toContain('await diagnoseNetworkRepairCheck(checkId)');
    expect(pageSource).not.toContain('<v-skeleton-loader');
    const backendPositions = NETWORK_REPAIR_CHECK_IDS.map(checkId => (
      backendSource.indexOf(`"${checkId}"`)
    ));
    expect(backendPositions.every(position => position >= 0)).toBe(true);
    expect(backendPositions).toEqual([...backendPositions].sort((a, b) => a - b));
  });

  it('keeps the window shell fixed and assigns scrolling to the check list', () => {
    expect(pageSource).toMatch(
      /\.network-repair-window__body\s*\{[^}]*overflow: hidden;/s,
    );
    expect(pageSource).toMatch(
      /\.network-repair-checks\s*\{[^}]*overflow-y: auto;/s,
    );
    expect(pageSource).toMatch(
      /\.network-repair-check\s*\{[^}]*min-height: 54px;/s,
    );
  });

  it('uses a quiet flat workbench with compact actions and visible pending checks', () => {
    expect(pageSource).toContain('class="network-repair-workbench"');
    expect(pageSource).toContain('class="network-repair-action"');
    expect(pageSource).toContain('height: var(--app-control-height-action)');
    expect(pageSource).toContain('role="list"');
    expect(pageSource).toContain("v-if=\"resultFor(checkId) && statusFor(checkId) !== 'checking'\"");
    expect(pageSource).toContain('@media (max-width: 820px)');
    expect(pageSource).toMatch(
      /\.network-repair-check__copy strong\s*\{[^}]*font-size: 13px;/s,
    );
    expect(pageSource).toMatch(
      /\.network-repair-check__copy span\s*\{[^}]*font-size: 11px;/s,
    );
    expect(pageSource).not.toContain('network-repair-heading');
    expect(pageSource).not.toContain('network-repair-idle');
    expect(pageSource).not.toMatch(
      /\.network-repair-(?:window|check--checking)\s*\{[^}]*(?:linear-gradient|animation:)/s,
    );
    expect(pageSource).not.toContain('network-repair-check-scan');
  });
});
