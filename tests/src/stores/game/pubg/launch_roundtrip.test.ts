import {describe, expect, it} from 'vitest';
import {buildPubgLaunchOptionsString, parsePubgLaunchOptionsString} from '@/stores/game/pubg/parse.ts';

function roundTrip(source: string) {
  const parsed = parsePubgLaunchOptionsString(source, 7168);
  return buildPubgLaunchOptionsString({
    options_selection: parsed.selection,
    settings_config: {window: parsed.window, graphics_api: parsed.graphics_api},
    parameter_overrides: parsed.parameter_overrides,
    custom_launch_options: parsed.custom_launch_options,
    max_mem: parsed.max_mem, max_mem_safe_limit_mb: 7168,
    refresh_rate: parsed.refresh_rate ?? 144,
    res_width: parsed.res_width ?? 1920, res_height: parsed.res_height ?? 1080,
    view_distance_scale: parsed.view_distance_scale ?? 0.8,
  });
}

describe('PUBG audited launch serialization', () => {
  it.each([
    '-dx9', '-sm4', '-dx11', '-dx12',
  ])('emits one canonical graphics option: %s', source => {
    expect(roundTrip(source)).toBe(source);
  });

  it.each([
    ['-dx10', '-sm4'], ['-d3d10', '-sm4'],
    ['-d3d11', '-dx11'], ['-d3d12', '-dx12'],
    ['-dx12 -d3d12 -dx12', '-dx12'],
  ])('normalizes %s without expanding aliases', (source, expected) => {
    expect(roundTrip(source)).toBe(expected);
    expect(roundTrip(expected)).toBe(expected);
  });

  it.each([
    '-ResX=1920', '-ResY=1080', '-ResX=1920 -ResY=oops',
    '-m_mousespeed 0', '-m_mouseaccel1 0 -m_mouseaccel2 0',
    '-dx11 -dx12', '-sm4 -dx12',
    '-fullscreen -windowed', '-windowed -noborder', '-window',
    '-nosplash +noIntroCinematics', '-force-feature-level-11-0',
    '+exec -dx12', '+exec "-ResX=1920 -ResY=1080"',
  ])('preserves partial, conflicting and unmanaged flags: %s', source => {
    const parsed = parsePubgLaunchOptionsString(source, 7168);
    expect(parsed.selection).toHaveLength(0);
    expect(parsed.custom_launch_options).toBe(source);
    expect(roundTrip(source)).toBe(source);
  });

  it('still manages complete resolution and mouse groups', () => {
    const source = '-ResX=1600 -ResY=900 -m_mousespeed 0 -m_mouseaccel1 0 -m_mouseaccel2 0';
    expect(roundTrip(source)).toBe(source);
  });
  it('keeps the current windowed spelling instead of rewriting it to -window', () => {
    expect(roundTrip('-windowed')).toBe('-windowed');
    expect(roundTrip('-windowed -windowed')).toBe('-windowed');
  });
});
