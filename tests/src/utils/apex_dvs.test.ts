import {describe, expect, it} from 'vitest';
import {APEX_DVS_FPS_LUT, applyDvsRelatedConstraints, configToDvsTarget, dvsTargetToConfig} from '@/utils/apex_dvs.ts';

describe('Apex DVS integer frame times', () => {
  it('matches the known enabled targets', () => {
    for (const entry of [...APEX_DVS_FPS_LUT,
      {target: 1, min: 950000, max: 980000},
      {target: 60, min: 15834, max: 16333},
      {target: 64, min: 14845, max: 15313},
    ]) {
      expect(dvsTargetToConfig(entry.target)).toEqual({
        enable: '1', min: String(entry.min), max: String(entry.max),
      });
    }
  });
  it('round trips every supported target', () => {
    for (let target = 1; target <= 100; target++) {
      const config = dvsTargetToConfig(target);
      const frame = Math.trunc(1 / target * 1e6);
      expect(Number(config.max)).toBe(frame - Math.trunc(2 * frame / 100));
      expect(Number(config.min)).toBe(frame - Math.trunc(2 * frame / 100) - Math.trunc(3 * frame / 100));
      expect(configToDvsTarget(config.enable, config.min!)).toBe(target);
    }
  });
  it('preserves frame times when disabled directly or by related controls', () => {
    expect(dvsTargetToConfig(0)).toEqual({enable: '0'});
    for (const trigger of ['antialias', 'vsync'] as const) {
      const values: Record<string, string> = {
        'setting.dvs_enable': '1', 'setting.dvs_gpuframetime_min': '14845',
        'setting.dvs_gpuframetime_max': '15313',
        'setting.mat_antialias_mode': '0', 'setting.mat_vsync_mode': '1',
      };
      applyDvsRelatedConstraints(key => values[key], (key, value) => { values[key] = value; }, trigger);
      expect(values['setting.dvs_enable']).toBe('0');
      expect(values['setting.dvs_gpuframetime_min']).toBe('14845');
      expect(values['setting.dvs_gpuframetime_max']).toBe('15313');
    }
  });
});
