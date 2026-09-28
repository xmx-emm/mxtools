import {describe, expect, it} from 'vitest';
import PubgLaunchOptionsConfig from '@/data/pubg_launch_options_config.ts';
import {isSteamLaunchOptionsImpl} from '@/types/steam.ts';
import {
  buildPubgLaunchOptionsString,
  parsePubgLaunchOptionsString,
} from '@/stores/game/pubg/parse.ts';

function option(identifier: string) {
  const value = PubgLaunchOptionsConfig.find(
    item => isSteamLaunchOptionsImpl(item) && item.identifier === identifier,
  );
  if (!value || !isSteamLaunchOptionsImpl(value)) throw new Error(`missing PUBG option ${identifier}`);
  return value;
}

describe('PUBG launch option parser', () => {
  it('matches complete tokens instead of substrings', () => {
    const parsed = parsePubgLaunchOptionsString(
      '-highness -logcmds=1 -foo "-high"',
      7168,
    );

    expect(parsed.selection).toHaveLength(0);
    expect(parsed.custom_launch_options).toBe('-highness -logcmds=1 -foo "-high"');
  });

  it('recognizes each configured graphics alias, including standalone dx10/dx11/dx12', () => {
    for (const [token, mode] of [
      ['-dx9', 'dx9'],
      ['-dx10', 'dx10'],
      ['-dx11', 'dx11'],
      ['-d3d11', 'dx11'],
      ['-dx12', 'dx12'],
    ] as const) {
      const parsed = parsePubgLaunchOptionsString(token, 7168);
      expect(parsed.graphics_api).toBe(mode);
      expect(parsed.selection.some(item => item.identifier === 'graphics_api')).toBe(true);
      expect(parsed.custom_launch_options).toBe('');
    }
  });

  it('keeps unknown and protected +exec arguments through a build round trip', () => {
    const parsed = parsePubgLaunchOptionsString(
      '-high -dx12 -mystery "hello world" +exec "cfg/-high"',
      7168,
    );

    expect(parsed.selection.some(item => item.identifier === 'high_priority')).toBe(true);
    expect(parsed.selection.some(item => item.identifier === 'graphics_api')).toBe(true);
    expect(parsed.custom_launch_options).toBe('-mystery "hello world" +exec "cfg/-high"');

    const rebuilt = buildPubgLaunchOptionsString({
      options_selection: parsed.selection,
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
    const reparsed = parsePubgLaunchOptionsString(rebuilt, 7168);

    expect(reparsed.custom_launch_options).toBe(parsed.custom_launch_options);
    expect(reparsed.selection.some(item => item.identifier === 'high_priority')).toBe(true);
    expect(reparsed.graphics_api).toBe('dx12');
  });

  it('does not claim an incomplete numeric option', () => {
    const parsed = parsePubgLaunchOptionsString('-maxMem=4096x -refresh 144x', 7168);
    expect(parsed.selection).toHaveLength(0);
    expect(parsed.max_mem).toBe(7168);
    expect(parsed.refresh_rate).toBeUndefined();
    expect(parsed.custom_launch_options).toBe('-maxMem=4096x -refresh 144x');
  });

  it('retains parameter overrides with case-insensitive exact matching', () => {
    const parsed = parsePubgLaunchOptionsString('-KoreanRating', 7168);
    expect(parsed.selection.some(item => item.identifier === 'korean_rating')).toBe(true);
    expect(parsed.parameter_overrides.korean_rating).toEqual(['-KoreanRating']);
    expect(parsed.custom_launch_options).toBe('');
  });

  it('uses the catalog entries when building managed options', () => {
    const built = buildPubgLaunchOptionsString({
      options_selection: [option('graphics_api'), option('high_priority')],
      settings_config: {window: '-fullscreen', graphics_api: 'dx10'},
      parameter_overrides: {},
      custom_launch_options: '-custom=value',
      max_mem: 4096,
      max_mem_safe_limit_mb: 7168,
      refresh_rate: 144,
      res_width: 1920,
      res_height: 1080,
      view_distance_scale: 0.8,
    });
    expect(built).toContain('-sm4');
    expect(built).not.toContain('-d3d10');
    expect(built).not.toContain('-dx10');
    expect(built).toContain('-high');
    expect(built).toContain('-custom=value');
  });
});
