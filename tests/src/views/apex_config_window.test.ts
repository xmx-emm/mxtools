import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {Ref} from 'vue';
const mocks = vi.hoisted(() => ({readUtf8File: vi.fn(), start: vi.fn(), refresh: vi.fn(), set: vi.fn(),
  isTauri: vi.fn(() => true), mounted: vi.fn(), close: vi.fn(),
  store: {launcher_selection_key: 'steam:1', is_config_snapshot_applying: false},
}));
vi.mock('vue', async () => ({...await vi.importActual('vue'), onMounted: mocks.mounted,
  onBeforeUnmount: vi.fn(), useSSRContext: () => ({modules: new Set()})}));
vi.mock('vue-i18n', () => ({useI18n: () => ({t: (key: string) => key, te: () => false})}));
vi.mock('@tauri-apps/api/core', () => ({isTauri: mocks.isTauri}));
vi.mock('@tauri-apps/api/window', () => ({getCurrentWindow: () => ({close: mocks.close, onCloseRequested: vi.fn()})}));
vi.mock('@tauri-apps/api/event', () => ({listen: vi.fn(), emit: vi.fn()}));
vi.mock('@/stores/game/apex.ts', () => ({useApexStore: () => ({...mocks.store,
  refresh_apex_accounts: mocks.refresh, set_config_import_snapshot: mocks.set, $tauri: {start: mocks.start}})}));
vi.mock('@/utils/tauri_store.ts', () => ({startTauriStoreOnce: (_key: string, start: () => unknown) => start()}));
vi.mock('@/ipc/commands.ts', () => ({readUtf8File: mocks.readUtf8File}));
vi.mock('@/components/AppTopBar.vue', () => ({default: {}}));
vi.mock('@/components/game/apex/preset/ApexConfigExportPage.vue', () => ({default: {}}));
vi.mock('@/components/game/apex/preset/ApexConfigImportPage.vue', () => ({default: {}}));
vi.mock('vuetify/components/VMain', () => ({VMain: {}}));
vi.mock('vuetify/components/VAlert', () => ({VAlert: {}}));
vi.mock('vuetify/components/VBtn', () => ({VBtn: {}}));
vi.mock('vuetify/components/VProgressCircular', () => ({VProgressCircular: {}}));
import Component from '@/views/ApexConfigWindow.vue';
type State = {ready: Ref<boolean>; error: Ref<string>; exportSnapshot: Ref<unknown>;
  initialize(request: {path: string; account: string; snapshot: string}): Promise<void>};
function setup(kind: 'import' | 'export') {
  return (Component as unknown as {setup(props: object, context: object): State}).setup({kind}, {expose: vi.fn()});
}
const snapshot = {kind: 'apex-config-snapshot', version: 1, exportedAt: '', launchOptions: {raw: '+fps_max 279'}};
beforeEach(() => {vi.clearAllMocks(); mocks.refresh.mockResolvedValue(undefined); mocks.start.mockResolvedValue(undefined);});
describe('independent snapshot window loading', () => {
  it('loads the import file before showing the page and adopts the snapshot', async () => {
    mocks.readUtf8File.mockResolvedValue(JSON.stringify(snapshot));
    const state = setup('import');
    await state.initialize({path: 'snapshot.json', account: 'steam:1', snapshot: ''});
    expect(state.ready.value).toBe(true);
    expect(mocks.set).toHaveBeenCalledWith(snapshot);
    expect(mocks.refresh).toHaveBeenCalled();
  });
  it('shows a read failure and can retry successfully', async () => {
    mocks.readUtf8File.mockRejectedValueOnce(new Error('READ_FAILED')).mockResolvedValue(JSON.stringify(snapshot));
    const state = setup('import');
    const request = {path: 'snapshot.json', account: 'steam:1', snapshot: ''};
    await state.initialize(request);
    expect(state.error.value).toBe('READ_FAILED');
    expect(state.ready.value).toBe(false);
    await state.initialize(request);
    expect(state.ready.value).toBe(true);
  });
  it('keeps the exported draft without loading accounts or disk values', async () => {
    const state = setup('export');
    await state.initialize({path: '', account: 'steam:1', snapshot: JSON.stringify(snapshot)});
    expect(state.exportSnapshot.value).toEqual(snapshot);
    expect(mocks.readUtf8File).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('ignores a late file read after a different file was opened', async () => {
    let resolve!: (text: string) => void;
    mocks.readUtf8File.mockReturnValueOnce(new Promise<string>(done => {resolve = done;}));
    const state = setup('import');
    const pending = state.initialize({path: 'old.json', account: 'steam:1', snapshot: ''});
    const newer = {...snapshot, launchOptions: {raw: '-novid'}};
    await state.initialize({path: '', account: 'steam:1', snapshot: JSON.stringify(newer)});
    resolve(JSON.stringify(snapshot));
    await pending;
    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith(newer);
  });
});
