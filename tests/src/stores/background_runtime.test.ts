import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import type {BackgroundRuntimeSnapshot} from '@/types/background_runtime.ts';

const mocks = vi.hoisted(() => ({
  eventHandler: null as ((event: {payload: BackgroundRuntimeSnapshot}) => void) | null,
  listen: vi.fn(),
  getBackgroundRuntime: vi.fn(),
  setBackgroundRuntimeAutostart: vi.fn(),
  setBackgroundRuntimeBetaFeatures: vi.fn(),
  configureBackgroundRuntime: vi.fn(),
  setBackgroundRuntimeLocale: vi.fn(),
  updateBackgroundRuntimeApexQ: vi.fn(),
  updateBackgroundRuntimeRazer: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({listen: mocks.listen}));
vi.mock('@/ipc/commands.ts', () => ({
  getBackgroundRuntime: mocks.getBackgroundRuntime,
  setBackgroundRuntimeAutostart: mocks.setBackgroundRuntimeAutostart,
  setBackgroundRuntimeBetaFeatures: mocks.setBackgroundRuntimeBetaFeatures,
  configureBackgroundRuntime: mocks.configureBackgroundRuntime,
  setBackgroundRuntimeLocale: mocks.setBackgroundRuntimeLocale,
  updateBackgroundRuntimeApexQ: mocks.updateBackgroundRuntimeApexQ,
  updateBackgroundRuntimeRazer: mocks.updateBackgroundRuntimeRazer,
}));

import {
  BACKGROUND_RUNTIME_CHANGED_EVENT,
  useBackgroundRuntimeStore,
} from '@/stores/background_runtime.ts';

function snapshot(overrides: Partial<BackgroundRuntimeSnapshot['config']> = {}): BackgroundRuntimeSnapshot {
  return {
    autostartSupported: true,
    autostartEnabled: false,
    configuredAutostart: false,
    launchMode: 'interactive',
    apexQState: 'disabled',
    razerState: 'disabled',
    config: {
      schemaVersion: 1,
      autostart: false,
      betaFeaturesEnabled: true,
      locale: 'zh-CN',
      apexQ: {enabled: false, setupDone: false, hotkey: 'F12'},
      razer: {enabled: false, deviceProfiles: {}, games: []},
      ...overrides,
    },
  };
}

describe('background runtime store synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.stubGlobal('window', {__TAURI_INTERNALS__: {}});
    mocks.eventHandler = null;
    mocks.listen.mockImplementation(async (_event, handler) => {
      mocks.eventHandler = handler;
      return vi.fn();
    });
  });

  it('subscribes before refresh and applies cross-WebView snapshots', async () => {
    const initial = snapshot();
    const changed = snapshot({autostart: true});
    changed.autostartEnabled = true;
    changed.configuredAutostart = true;
    mocks.getBackgroundRuntime.mockResolvedValue(initial);
    const runtime = useBackgroundRuntimeStore();

    await runtime.refresh();
    expect(mocks.listen).toHaveBeenCalledWith(BACKGROUND_RUNTIME_CHANGED_EVENT, expect.any(Function));
    mocks.eventHandler?.({payload: changed});

    expect(runtime.snapshot).toEqual(changed);
    expect(runtime.autostartEnabled).toBe(true);
  });

  it('does not let an older refresh response overwrite a newer event', async () => {
    const oldSnapshot = snapshot();
    const changed = snapshot({locale: 'en-US'});
    let resolveRefresh!: (value: BackgroundRuntimeSnapshot) => void;
    mocks.getBackgroundRuntime.mockReturnValue(new Promise((resolve) => {
      resolveRefresh = resolve;
    }));
    const runtime = useBackgroundRuntimeStore();

    const refresh = runtime.refresh();
    await vi.waitFor(() => expect(mocks.getBackgroundRuntime).toHaveBeenCalledOnce());
    mocks.eventHandler?.({payload: changed});
    resolveRefresh(oldSnapshot);
    await refresh;

    expect(runtime.snapshot).toEqual(changed);
  });

  it('updates Razer through the atomic partial command', async () => {
    const updated = snapshot({
      razer: {enabled: true, deviceProfiles: {}, games: []},
    });
    mocks.updateBackgroundRuntimeRazer.mockResolvedValue({snapshot: updated, statuses: []});
    const runtime = useBackgroundRuntimeStore();

    const result = await runtime.configureRazer(updated.config.razer);

    expect(mocks.updateBackgroundRuntimeRazer).toHaveBeenCalledWith(updated.config.razer);
    expect(mocks.configureBackgroundRuntime).not.toHaveBeenCalled();
    expect(result?.statuses).toEqual([]);
    expect(runtime.snapshot).toEqual(updated);
  });

  it('updates Apex Q and Beta through atomic partial commands', async () => {
    const apexUpdated = snapshot({
      apexQ: {enabled: true, setupDone: true, hotkey: 'Ctrl+Alt+Q'},
    });
    const betaUpdated = snapshot({betaFeaturesEnabled: false});
    mocks.updateBackgroundRuntimeApexQ.mockResolvedValue(apexUpdated);
    mocks.setBackgroundRuntimeBetaFeatures.mockResolvedValue(betaUpdated);
    const runtime = useBackgroundRuntimeStore();

    await runtime.configureApexQ(apexUpdated.config.apexQ);
    expect(mocks.updateBackgroundRuntimeApexQ).toHaveBeenCalledWith(apexUpdated.config.apexQ);
    expect(runtime.snapshot).toEqual(apexUpdated);

    await runtime.setBetaFeatures(false);
    expect(mocks.setBackgroundRuntimeBetaFeatures).toHaveBeenCalledWith(false);
    expect(mocks.configureBackgroundRuntime).not.toHaveBeenCalled();
    expect(runtime.snapshot).toEqual(betaUpdated);
  });

  it('persists only the requested runtime locale', async () => {
    const updated = snapshot({locale: 'en-US'});
    mocks.setBackgroundRuntimeLocale.mockResolvedValue(updated);
    const runtime = useBackgroundRuntimeStore();

    await runtime.setLocale('en-US');

    expect(mocks.setBackgroundRuntimeLocale).toHaveBeenCalledWith('en-US');
    expect(mocks.configureBackgroundRuntime).not.toHaveBeenCalled();
    expect(runtime.snapshot).toEqual(updated);
  });

  it('keeps the previous snapshot when locale persistence fails', async () => {
    const initial = snapshot();
    const runtime = useBackgroundRuntimeStore();
    runtime.snapshot = initial;
    mocks.setBackgroundRuntimeLocale.mockRejectedValue(new Error('locale write failed'));

    await expect(runtime.setLocale('en-US')).rejects.toThrow('locale write failed');

    expect(runtime.snapshot).toEqual(initial);
    expect(runtime.snapshot?.config.locale).toBe('zh-CN');
  });

  it('derives autostart presentation from actual registration and launch mode', () => {
    const runtime = useBackgroundRuntimeStore();
    expect(runtime.autostartStatus).toBe('loading');
    expect(runtime.backgroundLaunchMode).toBeNull();

    const unsupported = snapshot();
    unsupported.autostartSupported = false;
    runtime.snapshot = unsupported;
    expect(runtime.autostartStatus).toBe('unsupported');

    const enabled = snapshot({autostart: true});
    enabled.autostartEnabled = true;
    enabled.configuredAutostart = true;
    enabled.launchMode = 'autostart';
    runtime.snapshot = enabled;
    expect(runtime.autostartStatus).toBe('enabled');
    expect(runtime.backgroundLaunchMode).toBe('autostart');

    runtime.snapshot!.configuredAutostart = false;
    expect(runtime.autostartStatus).toBe('mismatch');

    runtime.snapshot = snapshot();
    expect(runtime.autostartStatus).toBe('disabled');
    expect(runtime.backgroundLaunchMode).toBe('interactive');
  });
});
