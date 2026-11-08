import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  currentWindow: {label: 'main'},
  settings: {
    resolvedToggleLocaleShortcut: 'Ctrl+Alt+Shift+Z',
    toggleLocaleShortcut: 'Ctrl+Alt+Shift+Z',
    toggleLocaleShortcutEnabled: true,
    locale: 'zh-CN',
    ensureShortcutDefaults: vi.fn(),
    setLocale: vi.fn(),
  },
  backgroundRuntime: {
    setLocale: vi.fn(),
  },
  setAppLocale: vi.fn(),
  isRegistered: vi.fn(),
  unregister: vi.fn(),
  addEventListener: vi.fn(),
  keydownHandler: null as ((event: KeyboardEvent) => void) | null,
}));

vi.mock('@/stores/settings.ts', () => ({
  DEFAULT_TOGGLE_LOCALE_SHORTCUT: 'Ctrl+Alt+Shift+Z',
  useSettingsStore: () => mocks.settings,
}));

vi.mock('@/stores/background_runtime.ts', () => ({
  useBackgroundRuntimeStore: () => mocks.backgroundRuntime,
}));

vi.mock('@/i18n/i18n.ts', () => ({
  setAppLocale: mocks.setAppLocale,
}));

vi.mock('@tauri-apps/plugin-global-shortcut', () => ({
  isRegistered: mocks.isRegistered,
  unregister: mocks.unregister,
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => mocks.currentWindow,
}));

vi.mock('@/utils/shortcut-recording.ts', () => ({
  isShortcutRecording: () => false,
}));

vi.mock('@/utils/shortcut-keys.ts', () => ({
  isTypingTarget: () => false,
  matchesAccelerator: () => true,
}));

describe('locale shortcut cleanup', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.currentWindow.label = 'main';
    mocks.settings.resolvedToggleLocaleShortcut = 'Ctrl+Alt+Shift+Z';
    mocks.settings.toggleLocaleShortcut = 'Ctrl+Alt+Shift+Z';
    mocks.settings.toggleLocaleShortcutEnabled = true;
    mocks.settings.locale = 'zh-CN';
    mocks.keydownHandler = null;
    mocks.isRegistered.mockResolvedValue(true);
    mocks.unregister.mockResolvedValue(undefined);
    mocks.setAppLocale.mockResolvedValue(true);
    mocks.backgroundRuntime.setLocale.mockResolvedValue(undefined);
    mocks.settings.setLocale.mockImplementation((locale: string) => {
      mocks.settings.locale = locale;
    });
    mocks.addEventListener.mockImplementation((type, listener) => {
      if (type === 'keydown') mocks.keydownHandler = listener as (event: KeyboardEvent) => void;
    });
    vi.stubGlobal('window', {addEventListener: mocks.addEventListener});
    vi.stubGlobal('document', {documentElement: {lang: 'zh-CN'}});
  });

  it('cleans every legacy locale candidate', async () => {
    mocks.settings.resolvedToggleLocaleShortcut = 'Ctrl+Alt+Z';
    mocks.settings.toggleLocaleShortcut = 'Ctrl+Alt+X';

    const {applyLocaleToggleShortcut} = await import('@/utils/global-shortcuts.ts');
    await applyLocaleToggleShortcut();

    expect(mocks.isRegistered).toHaveBeenCalledTimes(3);
    expect(mocks.isRegistered).toHaveBeenCalledWith('Ctrl+Alt+Z');
    expect(mocks.isRegistered).toHaveBeenCalledWith('Ctrl+Alt+Shift+Z');
    expect(mocks.isRegistered).toHaveBeenCalledWith('Ctrl+Alt+X');
    expect(mocks.unregister).toHaveBeenCalledTimes(3);
  });

  it('does not clean global shortcuts from a child WebView', async () => {
    mocks.currentWindow.label = 'apex-quick-preset';

    const {applyLocaleToggleShortcut} = await import('@/utils/global-shortcuts.ts');
    await applyLocaleToggleShortcut();

    expect(mocks.isRegistered).not.toHaveBeenCalled();
    expect(mocks.unregister).not.toHaveBeenCalled();
    expect(mocks.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), true);
  });

  it('loads and activates the next locale before updating browser metadata', async () => {
    const {applyLocaleToggleShortcut} = await import('@/utils/global-shortcuts.ts');
    await applyLocaleToggleShortcut();

    mocks.keydownHandler?.({
      repeat: false,
      target: null,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);
    await Promise.resolve();

    expect(mocks.settings.setLocale).toHaveBeenCalledWith('en-US');
    expect(mocks.setAppLocale).toHaveBeenCalledWith('en-US');
    await vi.waitFor(() => {
      expect(mocks.backgroundRuntime.setLocale).toHaveBeenCalledWith('en-US');
    });
    expect(document.documentElement.lang).toBe('en');
  });

  it('restores Pinia, i18n, and document metadata when native locale persistence fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.backgroundRuntime.setLocale.mockRejectedValue(new Error('locale write failed'));
    const {applyLocaleToggleShortcut} = await import('@/utils/global-shortcuts.ts');
    await applyLocaleToggleShortcut();

    mocks.keydownHandler?.({
      repeat: false,
      target: null,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent);

    await vi.waitFor(() => {
      expect(mocks.settings.setLocale).toHaveBeenLastCalledWith('zh-CN');
      expect(mocks.setAppLocale).toHaveBeenLastCalledWith('zh-CN');
    });
    expect(mocks.settings.locale).toBe('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(mocks.settings.setLocale.mock.calls.map(([locale]) => locale)).toEqual(['en-US', 'zh-CN']);
    expect(mocks.setAppLocale.mock.calls.map(([locale]) => locale)).toEqual(['en-US', 'zh-CN']);
    warning.mockRestore();
  });
});
