import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import gameSettings from '@/data/apex_game_settings.ts';
import videoSettings from '@/data/apex_video_config.ts';
import {collectVideoConfigIdentifiers, isApexVideoConfigImpl} from '@/types/apex.ts';
import {isValidApexGameSettingValue} from '@/utils/game/apex_game_settings.ts';
import {buildApexConfigSnapshot, parseApexConfigSnapshot} from '@/utils/game/apex_config_snapshot.ts';
import {parseApexLaunchOptionsString} from '@/utils/game/apex_launch_parse.ts';

describe('Apex corrected config contracts', () => {
  const removed = ['setting.dvs_supersample_enable', 'setting.mat_depthfeather_enable', 'setting.new_shadow_settings'];

  it('keeps retired and game-owned keys out of the editable catalog and snapshots', () => {
    const keys = videoSettings.filter(isApexVideoConfigImpl).flatMap(collectVideoConfigIdentifiers);
    for (const key of removed) expect(keys).not.toContain(key);
    const video = {'setting.fullscreen': '1', ...Object.fromEntries(removed.map(key => [key, '1']))};
    const built = buildApexConfigSnapshot({
      selection: {launchOptions: false, videoConfig: true}, videoConfig: video,
    });
    expect(built.videoConfig).toEqual({'setting.fullscreen': '1'});
    expect(parseApexConfigSnapshot(JSON.stringify({...built, videoConfig: video})).videoConfig)
      .toEqual({'setting.fullscreen': '1'});
  });

  it('accepts every managed default written by reset', () => {
    for (const file of ['settings', 'profile'] as const) {
      const text = readFileSync(new URL(
        '../../../../src-tauri/src/game/apex_defaults/' + file + '.cfg', import.meta.url,
      ), 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^([\w.]+)\s+"([^"]*)"$/);
        if (match) expect(isValidApexGameSettingValue(gameSettings, file, match[1], match[2]), match[1]).toBe(true);
      }
    }
  });

  it('uses valid ranges and keeps legacy threshold as an explicitly custom command', () => {
    expect(gameSettings.find(row => row.id === 'mouseSensitivity')?.min).toBe(0.1);
    const fade = videoSettings.filter(isApexVideoConfigImpl).find(row => row.identifier === 'group.fadeDistScale');
    expect(fade?.fields?.[0].min).toBe(1);
    expect(fade?.options?.find(row => row.values['setting.fadeDistScale'] === '1')?.outOfPreset).not.toBe(true);
    const read = parseApexLaunchOptionsString('+mat_letterbox_aspect_min 0.1 +mat_letterbox_aspect_goal 1.33 +mat_letterbox_aspect_threshold 8');
    expect(read.mat_letterbox_aspect_min).toBe(1);
    expect(read.customLaunchOptions).toBe('+mat_letterbox_aspect_threshold 8');
  });

  it('inherits game defaults for omitted aspect parameters rather than preset preferences', () => {
    expect(parseApexLaunchOptionsString('+mat_letterbox_aspect_goal 1.33').mat_letterbox_aspect_min).toBe(1.59);
    expect(parseApexLaunchOptionsString('+mat_letterbox_aspect_min 1').mat_letterbox_aspect_goal).toBe(1.6);
  });
});
