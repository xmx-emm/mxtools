import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  defaultAlterQPrefs,
  loadAlterQPrefs,
  saveAlterQPrefs,
} from '@/types/alter_q.ts';

const mocks = vi.hoisted(() => ({
  isRegistered: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-global-shortcut', () => ({
  isRegistered: mocks.isRegistered,
  register: mocks.register,
  unregister: mocks.unregister,
}));

vi.mock('@tauri-apps/api/event', () => ({
  emit: mocks.emit,
  listen: vi.fn(async () => () => undefined),
}));

vi.mock('@tauri-apps/api/window', () => ({
  availableMonitors: vi.fn(async () => []),
  currentMonitor: vi.fn(async () => null),
  getCurrentWindow: () => ({label: 'main'}),
  monitorFromPoint: vi.fn(async () => null),
  Effect: {Acrylic: 'Acrylic'},
}));

describe('applyAlterQPrefs', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    storage.clear();
    mocks.isRegistered.mockResolvedValue(false);
    mocks.register.mockResolvedValue(undefined);
    mocks.unregister.mockResolvedValue(undefined);
    mocks.emit.mockResolvedValue(undefined);
    delete (globalThis as typeof globalThis & {
      __mx_alter_q_hotkey_runtime_v1?: unknown;
    }).__mx_alter_q_hotkey_runtime_v1;
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
  });

  it('merges only changed fields onto the latest persisted preferences', async () => {
    const staleCaller = defaultAlterQPrefs();
    staleCaller.enabled = true;
    const latest = defaultAlterQPrefs();
    latest.overlayOpacity = 0.83;
    latest.closeToTray = true;
    saveAlterQPrefs(latest);

    const {applyAlterQPrefs} = await import('@/utils/alter_q.ts');
    await applyAlterQPrefs(staleCaller, {changedKeys: ['enabled']});

    expect(loadAlterQPrefs()).toMatchObject({
      enabled: true,
      overlayOpacity: 0.83,
      closeToTray: true,
    });
    expect(staleCaller.overlayOpacity).toBe(0.83);
    expect(staleCaller.closeToTray).toBe(true);
  });

  it('changes overlay geometry only for an explicit placement save', async () => {
    const latest = defaultAlterQPrefs();
    latest.overlayW = 320;
    saveAlterQPrefs(latest);
    const caller = {...latest, overlayW: 480};
    const {applyAlterQPrefs} = await import('@/utils/alter_q.ts');

    await applyAlterQPrefs(caller, {changedKeys: ['overlayW']});
    expect(loadAlterQPrefs().overlayW).toBe(320);

    caller.overlayW = 480;
    await applyAlterQPrefs(caller, {
      changedKeys: ['overlayW'],
      replaceOverlayGeometry: true,
    });
    expect(loadAlterQPrefs().overlayW).toBe(480);
  });
});
