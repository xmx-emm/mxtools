import {beforeEach, describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createPinia, setActivePinia} from 'pinia';
import {defaultApexQPrefs} from '@/types/apex_q.ts';
import {
  bindApexQPreferencesStore,
  loadApexQPrefs,
  patchApexQPrefs,
  resetApexQOverlayGeometry,
  saveApexQPrefs,
  useApexQPreferencesStore,
} from '@/stores/apex_q_preferences.ts';

const mocks = vi.hoisted(() => ({
  isRegistered: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  emit: vi.fn(),
}));
const apexQSource = readFileSync(new URL('../../../src/utils/apex_q.ts', import.meta.url), 'utf8');

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

describe('applyApexQPrefs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    bindApexQPreferencesStore(useApexQPreferencesStore());
    mocks.isRegistered.mockResolvedValue(false);
    mocks.register.mockResolvedValue(undefined);
    mocks.unregister.mockResolvedValue(undefined);
    mocks.emit.mockResolvedValue(undefined);
    delete (globalThis as typeof globalThis & {
      __mx_apex_q_hotkey_runtime_v1?: unknown;
    }).__mx_apex_q_hotkey_runtime_v1;
  });

  it('merges only changed fields onto the latest persisted preferences', async () => {
    const staleCaller = defaultApexQPrefs();
    staleCaller.enabled = true;
    const latest = defaultApexQPrefs();
    latest.overlayOpacity = 0.83;
    latest.usageConfirmed = true;
    saveApexQPrefs(latest);

    const {applyApexQPrefs} = await import('@/utils/apex_q.ts');
    await applyApexQPrefs(staleCaller, {changedKeys: ['enabled']});

    expect(loadApexQPrefs()).toMatchObject({
      enabled: true,
      overlayOpacity: 0.83,
      usageConfirmed: true,
    });
    expect(staleCaller.overlayOpacity).toBe(0.83);
    expect(staleCaller.usageConfirmed).toBe(true);
    expect(mocks.emit).toHaveBeenCalledWith('apex-q-prefs-changed', expect.objectContaining({
      prefs: {enabled: true},
      changedKeys: ['enabled'],
    }));
  });

  it('preserves an auxiliary-window geometry patch while saving a stale normal preference draft', () => {
    const staleDraft = defaultApexQPrefs();
    staleDraft.overlayOpacity = 0.8;
    patchApexQPrefs({
      overlayW: 480,
      overlayH: 260,
      overlayX: 120,
      overlayY: 80,
    });

    saveApexQPrefs(staleDraft, ['overlayOpacity']);

    expect(loadApexQPrefs()).toMatchObject({
      overlayOpacity: 0.8,
      overlayW: 480,
      overlayH: 260,
      overlayX: 120,
      overlayY: 80,
    });
  });

  it('resets only geometry when its caller holds a stale preference snapshot', () => {
    const staleGeometry = defaultApexQPrefs();
    staleGeometry.overlayX = 120;
    staleGeometry.overlayY = 80;
    staleGeometry.overlayW = 480;
    staleGeometry.overlayH = 260;
    patchApexQPrefs({overlayOpacity: 0.8, usageConfirmed: true});

    resetApexQOverlayGeometry(staleGeometry);

    expect(loadApexQPrefs()).toMatchObject({
      overlayX: null,
      overlayY: null,
      overlayW: 220,
      overlayH: 124,
      overlayPlacement: null,
      overlayOpacity: 0.8,
      usageConfirmed: true,
    });
  });

  it('limits hotkey rollback broadcasts to the fields they restore', () => {
    expect(apexQSource).toContain(
      "broadcastApexQPrefs(rollback, ['enabled', 'setupDone', 'hotkey'])",
    );
  });

  it('changes overlay geometry only for an explicit placement save', async () => {
    const latest = defaultApexQPrefs();
    latest.overlayW = 320;
    saveApexQPrefs(latest);
    const caller = {...latest, overlayW: 480};
    const {applyApexQPrefs} = await import('@/utils/apex_q.ts');

    await applyApexQPrefs(caller, {changedKeys: ['overlayW']});
    expect(loadApexQPrefs().overlayW).toBe(320);

    caller.overlayW = 480;
    await applyApexQPrefs(caller, {
      changedKeys: ['overlayW'],
      replaceOverlayGeometry: true,
    });
    expect(loadApexQPrefs().overlayW).toBe(480);
  });
});
