import {describe, expect, it} from 'vitest';
import {buildPubgLaunchOptionsString, parsePubgLaunchOptionsString} from '@/stores/game/pubg/parse.ts';

function rebuild(source: string, deselect = false) {
  const parsed = parsePubgLaunchOptionsString(source, 7168);
  return buildPubgLaunchOptionsString({
    options_selection: deselect ? [] : parsed.selection,
    settings_config: {window: parsed.window, graphics_api: parsed.graphics_api},
    parameter_overrides: parsed.parameter_overrides,
    custom_launch_options: parsed.custom_launch_options,
    max_mem: parsed.max_mem,
    max_mem_safe_limit_mb: 7168,
    refresh_rate: parsed.refresh_rate ?? 144,
    res_width: parsed.res_width ?? 1920,
    res_height: parsed.res_height ?? 1080,
    view_distance_scale: parsed.view_distance_scale ?? 0.8,
  });
}

describe('PUBG duplicate parameter ownership', () => {
  it.each([
    ['-high -HIGH -high', '-high'],
    ['-KoreanRating -koreanrating', '-KoreanRating'],
    ['-maxMem=4096 -MAXMEM=04096', '-maxMem=4096'],
    ['-refresh 144 -REFRESH 0144', '-refresh 144'],
    ['+mat_antialias 0 +mat_antialias 0', '+mat_antialias 0'],
    ['-ResX=1600 -ResY=900 -RESX=01600 -ResY=0900', '-ResX=1600 -ResY=900'],
    [
      '-m_mousespeed 0 -m_mousespeed 0 -m_mouseaccel1 0 -m_mouseaccel2 0 -m_mouseaccel2 0',
      '-m_mousespeed 0 -m_mouseaccel1 0 -m_mouseaccel2 0',
    ],
    ['-dx12 -d3d12 -dx12', '-dx12'],
    ['-windowed -windowed', '-windowed'],
  ])('claims all equal values and removes them on deselection: %s', (source, canonical) => {
    expect(parsePubgLaunchOptionsString(source, 7168).custom_launch_options).toBe('');
    expect(rebuild(source)).toBe(canonical);
    const removed = rebuild(source, true);
    expect(removed).toBe('');
    expect(parsePubgLaunchOptionsString(removed, 7168).selection).toEqual([]);
  });

  it.each([
    ['-maxMem=4096 -maxMem=2048 -maxMem=4096', '-maxMem=2048'],
    ['-refresh 144 -refresh 240 -refresh 144', '-refresh 240'],
    ['-ResX=1600 -ResY=900 -ResX=1920 -ResX=1600', '-ResX=1920'],
    ['-m_mousespeed 0 -m_mousespeed 1 -m_mouseaccel1 0 -m_mouseaccel2 0', '-m_mousespeed 1'],
  ])('retains different values under the existing first-value policy: %s', (source, remainder) => {
    expect(rebuild(source, true)).toBe(remainder);
  });

  it.each([
    '-dx11 -dx12 -dx11',
    '-fullscreen -windowed -fullscreen',
    '-ResX=1600 -ResX=1600',
    '-m_mousespeed 0 -m_mousespeed 0 -m_mouseaccel1 0',
    '+r.ViewDistanceScale=0.8 +r.ViewDistanceScale=.80',
  ])('preserves conflicting modes and incomplete groups: %s', source => {
    expect(parsePubgLaunchOptionsString(source, 7168).selection).toEqual([]);
    expect(rebuild(source)).toBe(source);
  });

  it('leaves quoted, exec-protected and unknown tokens untouched', () => {
    const custom = '+exec -high "-high" -unknown';
    expect(rebuild(`-high ${custom} -HIGH`, true)).toBe(custom);
    expect(rebuild('-refresh 144 +exec -refresh 144 -refresh 144', true)).toBe('+exec -refresh 144');
  });
});
