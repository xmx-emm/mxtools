import {describe, expect, it} from 'vitest';
import {quickPresetVideoConfigToggles} from '@/data/presets/apex_quick_preset.ts';
import zhCN from '@/i18n/locales/zh-CN/index.ts';
import enUS from '@/i18n/locales/en-US/index.ts';

describe('Apex quick preset target-state copy', () => {
  it('uses a dedicated enable label for anti-aliasing and disable for sun shadows', () => {
    expect(quickPresetVideoConfigToggles.find(toggle => toggle.key === 'antialias')?.label)
      .toBe('apexQuickPreset.video.enableAntialias');
    expect(zhCN.apexQuickPreset.video.enableAntialias)
      .toBe('\u5f00\u542f\u6297\u952f\u9f7f');
    expect(zhCN.apexQuickPreset.video.disableSunShadows)
      .toBe('\u7981\u7528\u9633\u5149\u9634\u5f71');
    expect(enUS.apexQuickPreset.video.enableAntialias).toBe('Enable anti-aliasing');
    expect(enUS.apexQuickPreset.video.disableSunShadows).toBe('Disable sun shadows');
    expect(zhCN.apexVideoConfig.matAntialiasMode.name).toBe('\u6297\u952f\u9f7f');
  });

  it.each([
    ['damageClosesDeathboxOff', false],
    ['stickySprintOn', true],
    ['autoSprintOn', true],
    ['rotateMinimapOn', true],
    ['subtitlesOff', false],
    ['abilityFovScalingOff', false],
  ] as const)('states the intended action for %s without a separate state prefix', (key, enabled) => {
    const chinese = zhCN.apexQuickPreset.optimizations[key];
    const english = enUS.apexQuickPreset.optimizations[key];
    expect(chinese.startsWith(enabled ? '\u5f00\u542f' : '\u7981\u7528')).toBe(true);
    expect(english.startsWith(enabled ? 'Enable ' : 'Disable ')).toBe(true);
    expect(chinese).not.toMatch(/[:\uff1a]/);
    expect(english).not.toContain(':');
  });

  it('describes the lowest view-shake level without presenting it as disabled', () => {
    expect(zhCN.apexQuickPreset.optimizations.viewShakeLowest.endsWith('\u8bbe\u4e3a\u6700\u4f4e'))
      .toBe(true);
    expect(enUS.apexQuickPreset.optimizations.viewShakeLowest).toBe('Set sprint view shake to lowest');
  });
});
