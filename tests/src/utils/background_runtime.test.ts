import {reactive} from 'vue';
import {describe, expect, it} from 'vitest';
import {
  cloneBackgroundRuntimeConfig,
  cloneRazerBackgroundConfig,
} from '@/utils/background_runtime.ts';
import type {
  BackgroundRuntimeConfig,
  RazerBackgroundConfig,
} from '@/types/background_runtime.ts';

function razerConfig(): RazerBackgroundConfig {
  return {
    enabled: false,
    deviceProfiles: {
      mouse: {idleRateHz: 1000, verifiedRatesHz: [1000, 2000]},
    },
    games: [],
  };
}

function runtimeConfig(): BackgroundRuntimeConfig {
  return {
    schemaVersion: 1,
    autostart: false,
    betaFeaturesEnabled: true,
    locale: 'zh-CN',
    apexQ: {enabled: false, setupDone: false, hotkey: 'F12'},
    razer: razerConfig(),
  };
}

describe('background runtime config cloning', () => {
  it('clones a reactive complete config without carrying its Proxy', () => {
    const source = reactive(runtimeConfig());

    const cloned = cloneBackgroundRuntimeConfig(source);
    cloned.razer.enabled = true;

    expect(cloned).toEqual({...runtimeConfig(), razer: {...runtimeConfig().razer, enabled: true}});
    expect(source.razer.enabled).toBe(false);
  });

  it('clones a reactive Razer config and isolates nested edits', () => {
    const source = reactive(razerConfig());

    const cloned = cloneRazerBackgroundConfig(source);
    cloned.enabled = true;
    cloned.deviceProfiles.mouse.idleRateHz = 2000;

    expect(cloned).toEqual({
      ...razerConfig(),
      enabled: true,
      deviceProfiles: {
        mouse: {idleRateHz: 2000, verifiedRatesHz: [1000, 2000]},
      },
    });
    expect(source.enabled).toBe(false);
    expect(source.deviceProfiles.mouse.idleRateHz).toBe(1000);
  });
});
