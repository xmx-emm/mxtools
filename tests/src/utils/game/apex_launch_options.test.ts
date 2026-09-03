import {describe, expect, it} from 'vitest';
import {formatApplyLaunchOptionError} from '@/composables/useCloseLauncherThenApply.ts';
import {parseApexLaunchOptionsString} from '@/utils/game/apex_launch_parse.ts';
import {buildApexLaunchOptionsString} from '@/utils/game/apex_launch_build.ts';
import {
  extractApexCustomLaunchOptions,
  normalizeApexCustomLaunchOptions,
} from '@/utils/game/apex_custom_launch_options.ts';

describe('formatApplyLaunchOptionError', () => {
  it('returns generic key for empty errors', () => {
    expect(formatApplyLaunchOptionError(null)).toBe('toast.applyLaunchOptionError');
    expect(formatApplyLaunchOptionError('')).toBe('toast.applyLaunchOptionError');
  });

  it('appends detail for real errors', () => {
    expect(formatApplyLaunchOptionError(new Error('boom'))).toBe(
      'toast.applyLaunchOptionError\nboom',
    );
  });
});

describe('parseApexLaunchOptionsString', () => {
  it('parses fps and resolution flags', () => {
    const parsed = parseApexLaunchOptionsString('-width 1280 -height 960 +fps_max 144');
    expect(parsed.width).toBe(1280);
    expect(parsed.height).toBe(960);
    expect(parsed.fps).toBe(144);
    expect(parsed.selection.some((o) => o.identifier === 'forced_resolution')).toBe(true);
    expect(parsed.selection.some((o) => o.identifier === 'fps')).toBe(true);
  });

  it('keeps unmanaged launch commands in the custom input', () => {
    const parsed = parseApexLaunchOptionsString(
      '-width 1280 -height 960 +fps_max 144 +exec "autoexec.cfg" -novid',
    );

    expect(parsed.customLaunchOptions).toBe('+exec "autoexec.cfg"');
  });

  it('does not parse command-looking text inside an exec path', () => {
    const parsed = parseApexLaunchOptionsString(
      '+exec "cfg/+fps_max 144 -width 1280 -height 960.cfg"',
    );

    expect(parsed.selection).toHaveLength(0);
    expect(parsed.fps).toBeUndefined();
    expect(parsed.width).toBeUndefined();
    expect(parsed.height).toBeUndefined();
    expect(parsed.customLaunchOptions).toBe(
      '+exec "cfg/+fps_max 144 -width 1280 -height 960.cfg"',
    );
  });

  it('keeps an exec argument that looks like a managed flag', () => {
    const parsed = parseApexLaunchOptionsString('+exec -high +cl_showfps 1');

    expect(parsed.selection.some(option => option.name === 'apexLaunchOptions.highPriority.name')).toBe(false);
    expect(parsed.selection.some(option => option.name === 'apexLaunchOptions.showFps.name')).toBe(true);
    expect(parsed.customLaunchOptions).toBe('+exec -high');
  });

  it('classifies the complete managed catalog and leaves only custom commands', () => {
    const parsed = parseApexLaunchOptionsString([
      '-windowed',
      '+cl_fovScale "1.7"',
      '+cl_showfps 1',
      '+cl_showpos 1',
      '+reticle_color "2147483648 2147483648 2147483648"',
      '+mat_minimize_on_alt_tab 1',
      '+mat_letterbox_aspect_min 0.1',
      '+mat_letterbox_aspect_goal 1.7778',
      '+mat_letterbox_aspect_threshold 8',
      '-width 1600 -height 900',
      '+fps_max 144',
      '+lobby_max_fps 0',
      '-high',
      '-novid -dev',
      '+miles_channels 2',
      '+miles_language japanese',
      '+cl_is_softened_locale 1',
      '-no_render_on_input_thread -nojoy',
      '+exec "autoexec.cfg"',
    ].join(' '));

    expect(parsed.selection).toHaveLength(17);
    expect(parsed.settingsPatch).toMatchObject({
      window: '-window',
      miles_channels: '+miles_channels 2',
      miles_language: '+miles_language japanese',
      fps: '+fps_max X',
    });
    expect(parsed.width).toBe(1600);
    expect(parsed.height).toBe(900);
    expect(parsed.fps).toBe(144);
    expect(parsed.lobby_max_fps).toBe(0);
    expect(parsed.customLaunchOptions).toBe('+exec "autoexec.cfg"');
  });

  it('leaves launch flags removed from the current game build in the custom remainder', () => {
    // 已从当前构建(R5pc_r5-300_J57)二进制确认删除的 token 不再被认领,
    // 留在自定义输入框里由用户自行清理。证据见 docs/CHANGELOG.md。
    const parsed = parseApexLaunchOptionsString(
      '-freq 144 -forcenovsync +cl_ragdoll_collide 0 -limitvsconst '
      + '-anticheat_settings=SettingsDX12.json +m_rawinput 1 -noforcemaccel '
      + '+cl_forcepreload 1 -preload +fps_max 144',
    );

    expect(parsed.fps).toBe(144);
    expect(parsed.customLaunchOptions).toBe(
      '-freq 144 -forcenovsync +cl_ragdoll_collide 0 -limitvsconst '
      + '-anticheat_settings=SettingsDX12.json +m_rawinput 1 -noforcemaccel '
      + '+cl_forcepreload 1 -preload',
    );
  });

  it('keeps incomplete managed pairs in the custom remainder', () => {
    const parsed = parseApexLaunchOptionsString('-width 1280 +exec autoexec.cfg');

    expect(parsed.width).toBeUndefined();
    expect(parsed.height).toBeUndefined();
    expect(parsed.selection.some(option => option.identifier === 'forced_resolution')).toBe(false);
    expect(parsed.customLaunchOptions).toBe('-width 1280 +exec autoexec.cfg');
  });

  it('keeps unsupported managed values editable as custom commands', () => {
    const parsed = parseApexLaunchOptionsString('+fps_max adaptive');

    expect(parsed.fps).toBeUndefined();
    expect(parsed.selection.some(option => option.identifier === 'fps')).toBe(false);
    expect(parsed.customLaunchOptions).toBe('+fps_max adaptive');
  });
});

describe('custom Apex launch options', () => {
  it('does not treat a known-looking quoted config path as a managed option', () => {
    expect(extractApexCustomLaunchOptions('+exec "cfg/+fps_max 144.cfg"')).toBe(
      '+exec "cfg/+fps_max 144.cfg"',
    );
  });

  it('preserves whitespace inside quoted custom values', () => {
    expect(extractApexCustomLaunchOptions('-high +exec "my  config.cfg"')).toBe(
      '+exec "my  config.cfg"',
    );
  });

  it('normalizes pasted control characters before applying', () => {
    expect(normalizeApexCustomLaunchOptions('+exec autoexec.cfg\n-dev\t')).toBe(
      '+exec autoexec.cfg -dev ',
    );
  });
});

describe('buildApexLaunchOptionsString', () => {
  it('builds forced resolution from selection', () => {
    const forced = parseApexLaunchOptionsString('-width 1920 -height 1080').selection.find(
      (o) => o.identifier === 'forced_resolution',
    );
    expect(forced).toBeTruthy();
    const built = buildApexLaunchOptionsString({
      options_selection: forced ? [forced] : [],
      settings_config: {},
      custom_launch_options: '+exec "autoexec.cfg"',
      lobby_max_fps: 0,
      width: 1600,
      height: 900,
      mat_letterbox_aspect_min: 1.7778,
      mat_letterbox_aspect_goal: 1.7778,
      mat_letterbox_aspect_threshold: 0.01,
      fps: 144,
      activeAcc: null,
    });
    expect(built).toContain('-width 1600');
    expect(built).toContain('-height 900');
    expect(built).toContain('+exec "autoexec.cfg"');
  });

  it('keeps custom commands single and stable across read and rebuild', () => {
    const parsed = parseApexLaunchOptionsString(
      '-high +fps_max 144 +exec "autoexec.cfg"',
    );
    const built = buildApexLaunchOptionsString({
      options_selection: parsed.selection,
      settings_config: parsed.settingsPatch,
      custom_launch_options: parsed.customLaunchOptions,
      lobby_max_fps: parsed.lobby_max_fps ?? 0,
      width: parsed.width ?? 1920,
      height: parsed.height ?? 1080,
      mat_letterbox_aspect_min: parsed.mat_letterbox_aspect_min ?? 0.1,
      mat_letterbox_aspect_goal: parsed.mat_letterbox_aspect_goal ?? 1.7778,
      mat_letterbox_aspect_threshold: parsed.mat_letterbox_aspect_threshold ?? 8,
      fps: parsed.fps ?? 144,
      activeAcc: null,
    });
    const reparsed = parseApexLaunchOptionsString(built);

    expect(built.match(/\+exec/g)).toHaveLength(1);
    expect(reparsed.customLaunchOptions).toBe('+exec "autoexec.cfg"');
    expect(reparsed.fps).toBe(144);
    expect(reparsed.selection.some(option => option.name === 'apexLaunchOptions.highPriority.name')).toBe(true);
  });
});
