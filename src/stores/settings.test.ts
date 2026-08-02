import {beforeEach, describe, expect, it} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import {useSettingsStore} from '@/stores/settings.ts';

describe('settings beta features', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('defaults off and follows explicit changes', () => {
    const settings = useSettingsStore();
    expect(settings.betaFeaturesEnabled).toBe(false);

    settings.setBetaFeaturesEnabled(true);
    expect(settings.betaFeaturesEnabled).toBe(true);
  });
});

describe('settings performance mode', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('defaults off and follows explicit changes', () => {
    const settings = useSettingsStore();
    expect(settings.performanceMode).toBe(false);

    settings.setPerformanceMode(true);
    expect(settings.performanceMode).toBe(true);
  });
});
