import {describe, expect, it} from 'vitest';
import {findGraphicsQualityPreset} from '@/data/presets/apex_quick_preset.ts';

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
});
