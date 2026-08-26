import {describe, expect, it} from 'vitest';
import {formatApplyLaunchOptionError} from '@/composables/useCloseLauncherThenApply.ts';
import {parseApexLaunchOptionsString} from '@/utils/game/apex_launch_parse.ts';
import {buildApexLaunchOptionsString} from '@/utils/game/apex_launch_build.ts';

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
  });
});
