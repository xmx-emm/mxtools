import {describe, expect, it} from 'vitest';
import {
  calcSafeMaxMemMb,
  clampMaxMemMb,
  clampViewDistance,
  matchFloat,
  matchInt,
  normalizeTotalMemMb,
} from './helpers.ts';
import {parsePubgLaunchOptionsString} from './parse.ts';

describe('pubg helpers', () => {
  it('matchInt / matchFloat extract finite numbers', () => {
    expect(matchInt(/-maxMem=(\d+)/i, '-maxMem=4096 -refresh 144')).toBe(4096);
    expect(matchInt(/-maxMem=(\d+)/i, '-refresh 144')).toBeNull();
    expect(matchFloat(/\+r\.ViewDistanceScale=([0-9]*\.?[0-9]+)/i, '+r.ViewDistanceScale=0.75')).toBe(0.75);
  });

  it('clampViewDistance keeps values in [0.5, 1]', () => {
    expect(clampViewDistance(0.2)).toBe(0.5);
    expect(clampViewDistance(0.8)).toBe(0.8);
    expect(clampViewDistance(1.5)).toBe(1);
  });

  it('normalizeTotalMemMb / calcSafeMaxMemMb / clampMaxMemMb', () => {
    expect(normalizeTotalMemMb(Number.NaN)).toBe(8192);
    expect(normalizeTotalMemMb(256)).toBe(8192);
    expect(normalizeTotalMemMb(16384.9)).toBe(16384);
    expect(calcSafeMaxMemMb(8192)).toBe(7168);
    expect(clampMaxMemMb(100, 7168)).toBe(512);
    expect(clampMaxMemMb(9000, 7168)).toBe(7168);
    expect(clampMaxMemMb(4096.7, 7168)).toBe(4096);
  });
});

describe('parsePubgLaunchOptionsString', () => {
  it('parses maxMem, refresh and resolution from launch string', () => {
    const parsed = parsePubgLaunchOptionsString(
      '-maxMem=4096 -refresh 165 -ResX=1600 -ResY=900',
      7168,
    );
    expect(parsed.max_mem).toBe(4096);
    expect(parsed.refresh_rate).toBe(165);
    expect(parsed.res_width).toBe(1600);
    expect(parsed.res_height).toBe(900);
    expect(parsed.selection.some((o) => o.identifier === 'max_mem')).toBe(true);
    expect(parsed.selection.some((o) => o.identifier === 'refresh_rate')).toBe(true);
    expect(parsed.selection.some((o) => o.identifier === 'forced_resolution')).toBe(true);
  });
});
