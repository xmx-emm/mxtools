import {describe, expect, it} from 'vitest';
import {
  buildDefaultVideoOptions,
  findGraphicsQualityPreset,
  quickPresetVideoConfigToggles,
} from '@/data/presets/apex_quick_preset.ts';
import {applyQuickPresetVideoOptions} from '@/utils/game/apex_quick_preset.ts';

describe('Apex quick preset graphics values', () => {
  it('keeps competitive textures minimal while using high model detail', () => {
    const competitive = findGraphicsQualityPreset('competitive');

    expect(competitive?.values).toMatchObject({
      'setting.stream_memory': '0',
      'setting.mat_picmip': '3',
      'setting.dynamic_streaming_budget': '0',
      'setting.r_lod_switch_scale': '1',
    });
  });

  it('disables VSync with its linked backbuffer value by default', () => {
    const updates: Record<string, string> = {};

    expect(buildDefaultVideoOptions().disable_vsync).toBe(true);
    applyQuickPresetVideoOptions(
      (key, value) => { updates[key] = value; },
      {disable_vsync: true},
    );

    expect(quickPresetVideoConfigToggles.find(toggle => toggle.key === 'disable_vsync'))
      .toMatchObject({defaultEnabled: true});
    expect(updates).toMatchObject({
      'setting.mat_vsync_mode': '0',
      'setting.mat_backbuffer_count': '1',
    });
  });

  it('uses the quick-preset-specific map decoration label', () => {
    expect(quickPresetVideoConfigToggles.find(toggle => toggle.key === 'map_detail_low'))
      .toMatchObject({label: 'apexQuickPreset.video.lowMapDecorations'});
  });

  it('sets adaptive resolution to zero when TSAA is enabled', () => {
    const antialias = quickPresetVideoConfigToggles.find(toggle => toggle.key === 'antialias');

    expect(antialias?.onValues).toEqual({
      'setting.mat_antialias_mode': '12',
      'setting.dvs_enable': '0',
      'setting.dvs_gpuframetime_min': '38000',
      'setting.dvs_gpuframetime_max': '39200',
    });
  });
});
