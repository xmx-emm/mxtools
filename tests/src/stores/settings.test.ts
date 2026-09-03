import {beforeEach, describe, expect, it} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import {
  DEFAULT_TOGGLE_LOCALE_SHORTCUT,
  normalizeApexVideoFabPosition,
  useSettingsStore,
} from '@/stores/settings.ts';

describe('settings locale shortcut', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('uses Ctrl+Alt+Shift+Z as the default locale toggle shortcut', () => {
    const settings = useSettingsStore();
    expect(DEFAULT_TOGGLE_LOCALE_SHORTCUT).toBe('Ctrl+Alt+Shift+Z');
    expect(settings.resolvedToggleLocaleShortcut).toBe(DEFAULT_TOGGLE_LOCALE_SHORTCUT);
  });

  it('migrates the previous default without replacing a custom shortcut', () => {
    const settings = useSettingsStore();
    settings.toggleLocaleShortcut = 'Ctrl+Alt+Z';
    settings.ensureShortcutDefaults();
    expect(settings.toggleLocaleShortcut).toBe(DEFAULT_TOGGLE_LOCALE_SHORTCUT);

    settings.toggleLocaleShortcut = 'Ctrl+Shift+L';
    settings.ensureShortcutDefaults();
    expect(settings.toggleLocaleShortcut).toBe('Ctrl+Shift+L');
  });
});

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

describe('Apex video FAB position persistence', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('clamps valid persisted positions and resets malformed values to the default', () => {
    expect(normalizeApexVideoFabPosition({side: 'left', topRatio: -0.25})).toEqual({
      side: 'left', topRatio: 0,
    });
    expect(normalizeApexVideoFabPosition({side: 'right', topRatio: 2})).toEqual({
      side: 'right', topRatio: 1,
    });
    expect(normalizeApexVideoFabPosition({side: 'top', topRatio: 0.5})).toEqual({
      side: 'right', topRatio: 0.7,
    });
    expect(normalizeApexVideoFabPosition({side: 'left', topRatio: Number.NaN})).toEqual({
      side: 'right', topRatio: 0.7,
    });
  });

  it('normalizes hydrated FAB position state during startup defaults', () => {
    const settings = useSettingsStore();
    settings.apexVideoFabPosition = {side: 'left', topRatio: 4};
    settings.ensureShortcutDefaults();
    expect(settings.apexVideoFabPosition).toEqual({side: 'left', topRatio: 1});
  });
});
