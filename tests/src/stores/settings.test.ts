import {beforeEach, describe, expect, it} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import {DEFAULT_TOGGLE_LOCALE_SHORTCUT, useSettingsStore} from '@/stores/settings.ts';

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
