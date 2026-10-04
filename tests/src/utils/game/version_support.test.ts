import {describe, expect, it} from 'vitest';
import {gameVersionStatus, verifiedGameBuilds} from '@/utils/game/version_support.ts';

describe('Game compatibility uses exact verified builds', () => {
  it('does not infer compatibility from a matching short version', () => {
    expect(verifiedGameBuilds.apex).toEqual([]);
    expect(gameVersionStatus('apex', {installed: true, version: 'v3.0.4.57', build: 'R5pc_r5-300_J57_CL11457258_2026_08_19_15_40'})).toBe('unverified');
    expect(gameVersionStatus('apex', {installed: true, version: 'v3.0.5.20', build: 'R5pc_r5-301_J20_CL11528440_FSv30_1_2026_09_04_16_06'})).toBe('unverified');
    expect(gameVersionStatus('apex', {installed: true, version: 'v3.0.4.57', build: 'new-build'})).toBe('unverified');
  });
  it('keeps missing evidence distinct from unsupported installations', () => {
    expect(gameVersionStatus('apex', null)).toBe('unknown');
    expect(gameVersionStatus('apex', {installed: false, version: null, build: null})).toBe('notInstalled');
    expect(gameVersionStatus('apex', {installed: true, version: 'v3.0.4.57', build: null})).toBe('unknown');
    expect(gameVersionStatus('pubg', {installed: true, version: null, build: '25049128'})).toBe('unverified');
  });
  it('limits exact Apex static reviews to launch options, not the full configuration', () => {
    const reviewed = [
      {version: 'v3.0.1.28', build: 'R5pc_r5-301_J28_CL11570498_FSv30_1_2026_09_16_17_18'},
      {version: 'v3.0.2.44', build: 'R5pc_r5-301_J44_CL11595978_FSv30_1_2026_09_23_12_37'},
      {version: 'v3.0.2.58', build: 'R5pc_r5-301_J58_CL11595978_FSv30_1_EX_2026_10_01_16_15'},
    ];
    for (const value of reviewed) {
      expect(gameVersionStatus('apex', {installed: true, ...value}, 'launch')).toBe('launchReviewed');
      expect(gameVersionStatus('apex', {installed: true, ...value})).toBe('unverified');
    }
    expect(gameVersionStatus('apex', {installed: true, version: 'v3.0.2.44', build: 'future-J44'}, 'launch')).toBe('unverified');
  });
  it('does not promote the PUBG literal audit to verified game behavior', () => {
    const value = {installed: true, version: null, build: '25449918'};
    expect(gameVersionStatus('pubg', value, 'launch')).toBe('launchPartial');
    expect(gameVersionStatus('pubg', value)).toBe('unverified');
    expect(verifiedGameBuilds.pubg).toEqual([]);
  });
});
