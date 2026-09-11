import {describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
const mocks = vi.hoisted(() => ({apexIsRunning: vi.fn().mockResolvedValue(false), mutateApexConfig: vi.fn().mockResolvedValue({changedScopes: ['gameSettings']})}));
vi.mock('@/ipc/commands.ts', async () => ({...await vi.importActual('@/ipc/commands.ts'), ...mocks}));
vi.mock('vue-toastification', () => ({useToast: () => ({error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn()})}));
import {useApexStore} from '@/stores/game/apex/index.ts';
import {adoptApexGameSettingsReport} from '@/stores/game/apex/actions_settings.ts';

describe('sparse binding snapshot apply', () => {
  it('preserves default duplicate menu bindings while changing aim mode', async () => {
    setActivePinia(createPinia());
    const store = useApexStore();
    adoptApexGameSettingsReport(store, {
      settings: {path: '', revision: 's', values: {}, unknownKeys: [], backupAvailable: false},
      profile: {path: '', revision: 'p', values: {}, unknownKeys: [], backupAvailable: false},
      bindings: [
        {id: 'esc', input: 'ESCAPE', command: 'ingamemenu_activate', context: 0, occurrence: 0, editable: true},
        {id: 'start', input: 'START', command: 'ingamemenu_activate', context: 0, occurrence: 1, editable: true},
        {id: 'aim', input: 'MOUSE2', command: '+toggle_zoom', context: 0, occurrence: 0, editable: true},
      ],
    });
    const applied = await store.apply_config_snapshot({kind: 'apex-config-snapshot', version: 2, exportedAt: '',
      gameSettings: {settings: {}, profile: {}, bindingsMode: 'patch', bindings: [
        {input: '', command: '+toggle_zoom', context: 0, occurrence: 0},
        {input: 'MOUSE2', command: '+zoom', context: 0, occurrence: 0},
      ]},
    }, {importLaunchOptions: false, importVideoConfig: false, importBindings: true, videoSelectMode: 'all', selectedVideoItemIds: []});
    expect(applied).toBe(true);
    expect(mocks.mutateApexConfig.mock.calls[0][0].request.gameSettings.bindingMutations).toEqual([
      {operation: 'delete', id: 'aim'},
      {operation: 'createCommand', command: '+zoom', input: 'MOUSE2', context: 0},
    ]);
  });
});
