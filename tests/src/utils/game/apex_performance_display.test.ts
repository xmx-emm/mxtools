import {describe, expect, it} from 'vitest';
import {quickPresetLaunchOptionToggles} from '@/data/presets/apex_quick_preset.ts';
import {buildApexLaunchOptionsString} from '@/utils/game/apex_launch_build.ts';
import {parseApexLaunchOptionsString} from '@/utils/game/apex_launch_parse.ts';
import {applyQuickPresetLaunchOptions, initLaunchOptionsForDialog} from '@/utils/game/apex_quick_preset.ts';

describe('Apex performance display launch preset', () => {
  it.each(['steam', 'ea'] as const)('writes and reopens the FPS preset on %s', kind => {
    const user = {id: '1', name: 'Fixture', avatar: '', config_path: 'fixture.cfg', user_userid: '1', nu_hash: ''};
    const parsed = parseApexLaunchOptionsString('+cl_showfps 1 +exec "custom.cfg"');
    expect(initLaunchOptionsForDialog(parsed.selection).show_fps).toBe(false);
    const toggles = Object.fromEntries(quickPresetLaunchOptionToggles.map(option => [option.key, option.key === 'show_fps']));
    applyQuickPresetLaunchOptions(parsed.selection, toggles);
    const input = {
      options_selection: parsed.selection, settings_config: {},
      custom_launch_options: parsed.customLaunchOptions,
      lobby_max_fps: 60, width: 1920, height: 1080,
      mat_letterbox_aspect_min: 1, mat_letterbox_aspect_goal: 16 / 9, fps: 144,
      activeAcc: {kind, user},
    };
    let launch = buildApexLaunchOptionsString(input);
    expect(launch).toBe('+net_netGraph2 1 +cl_showfps 1 +exec "custom.cfg"');
    for (let reopen = 0; reopen < 2; reopen++) {
      const fresh = parseApexLaunchOptionsString(launch);
      expect(initLaunchOptionsForDialog(fresh.selection).show_fps).toBe(true);
      expect(fresh.customLaunchOptions).toBe('+cl_showfps 1 +exec "custom.cfg"');
      launch = buildApexLaunchOptionsString({...input, options_selection: fresh.selection});
    }
    applyQuickPresetLaunchOptions(parsed.selection, {...toggles, show_fps: false});
    expect(buildApexLaunchOptionsString(input)).toBe('+cl_showfps 1 +exec "custom.cfg"');
  });

  it.each([
    '+cl_showfps 1', '+net_netGraph2 0', '+net_netGraph2 2',
    '+net_netGraph2', '+exec +net_netGraph2 1',
    '+exec "+net_netGraph2 1"', '+net_netGraph2 "1',
  ])('does not claim a legacy, disabled or protected option: %s', source => {
    const parsed = parseApexLaunchOptionsString(source);
    expect(initLaunchOptionsForDialog(parsed.selection).show_fps).toBe(false);
    expect(parsed.customLaunchOptions).toBe(source);
  });

  it('keeps the invalid 4-channel value custom instead of presenting it as 4.1', () => {
    const parsed = parseApexLaunchOptionsString('+miles_channels 4');
    expect(parsed.selection).toHaveLength(0);
    expect(parsed.customLaunchOptions).toBe('+miles_channels 4');
  });
});
