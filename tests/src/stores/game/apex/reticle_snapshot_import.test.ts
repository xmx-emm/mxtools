import {describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
const mocks = vi.hoisted(() => ({apexIsRunning: vi.fn().mockResolvedValue(false),
  mutateApexConfig: vi.fn().mockResolvedValue({changedScopes: ['gameSettings']})}));
vi.mock('@/ipc/commands.ts', async () => ({...await vi.importActual('@/ipc/commands.ts'), ...mocks}));
vi.mock('vue-toastification', () => ({useToast: () => ({error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn()})}));
import {useApexStore} from '@/stores/game/apex/index.ts';
import {adoptApexGameSettingsReport} from '@/stores/game/apex/actions_settings.ts';
import {buildApexConfigSnapshot, stringifyApexConfigSnapshot, parseApexConfigSnapshot} from '@/utils/game/apex_config_snapshot.ts';

describe('simplified reticle export and import', () => {
  it('passes the exported profile value unchanged to the native transaction', async () => {
    setActivePinia(createPinia());
    const store = useApexStore();
    adoptApexGameSettingsReport(store, {
      settings: {path: '', revision: 's', values: {}, unknownKeys: [], backupAvailable: false},
      profile: {path: '', revision: 'p', values: {reticle_color: ''}, unknownKeys: [], backupAvailable: false},
      bindings: [],
    });
    const value = '2147483648 2147483648 2147483648';
    const exported = buildApexConfigSnapshot({selection: {launchOptions: false, videoConfig: false, gameSettings: true},
      gameSettings: {settings: {}, profile: {reticle_color: value}}});
    const imported = parseApexConfigSnapshot(stringifyApexConfigSnapshot(exported));
    expect(await store.apply_config_snapshot(imported, {importLaunchOptions: false, importVideoConfig: false,
      importGameSettings: true, importBindings: false, videoSelectMode: 'all', selectedVideoItemIds: []})).toBe(true);
    expect(mocks.mutateApexConfig.mock.calls[0][0].request.gameSettings.profileUpdates).toEqual({reticle_color: value});
  });
});
