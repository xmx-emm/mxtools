import {describe, expect, it, vi} from 'vitest';
import type {Ref} from 'vue';
import type {ApexConfigSnapshot} from '@/types/apex_config_snapshot.ts';
const mocks = vi.hoisted(() => ({writeUtf8File: vi.fn(), save: vi.fn(), explorerFolder: vi.fn()}));
vi.mock('@/ipc/commands.ts', () => mocks);
vi.mock('@tauri-apps/plugin-dialog', () => ({save: mocks.save}));
vi.mock('vue-i18n', () => ({useI18n: () => ({t: (key: string) => key})}));
vi.mock('vue-toastification', () => ({useToast: () => ({error: vi.fn(), success: vi.fn()})}));
vi.mock('vue', async () => ({...await vi.importActual('vue'), onMounted: vi.fn(), useSSRContext: () => ({modules: new Set()})}));
vi.mock('@/components/game/apex/preset/ApexSnapshotSection.vue', () => ({default: {}}));
vi.mock('vuetify/components/VCard', () => ({VCard: {}, VCardText: {}, VCardActions: {}}));
vi.mock('vuetify/components/VBtn', () => ({VBtn: {}}));
vi.mock('vuetify/components/VGrid', () => ({VSpacer: {}}));
import Component from '@/components/game/apex/preset/ApexConfigExportPage.vue';

describe('export displayed snapshot', () => {
  it('writes previewed draft values and omits deselected blocks', async () => {
    const snapshot: ApexConfigSnapshot = {kind: 'apex-config-snapshot', version: 1, exportedAt: '',
      launchOptions: {raw: '+fps_max 279'}, videoConfig: {'setting.fullscreen': '0'},
      gameSettings: {settings: {mouse_sensitivity: '1.5'}, profile: {}},
    };
    const emit = vi.fn();
    const state = (Component as unknown as {setup(props: object, context: object): {
      choices: Ref<Record<string, boolean>>; confirmExport(): Promise<void>;
    }}).setup({snapshot, defaults: {...snapshot, launchOptions: {raw: ''}, videoConfig: {}, gameSettings: {settings: {}, profile: {}}}}, {expose: vi.fn(), emit});
    state.choices.value.launch = false;
    mocks.explorerFolder.mockResolvedValue('C:/fixture');
    mocks.save.mockResolvedValue('C:/fixture/output.json');
    mocks.writeUtf8File.mockResolvedValue(undefined);
    await state.confirmExport();
    const written = JSON.parse(mocks.writeUtf8File.mock.calls[0][0].content);
    expect(written.launchOptions).toBeUndefined();
    expect(written.videoConfig).toEqual(snapshot.videoConfig);
    expect(written.gameSettings.settings.mouse_sensitivity).toBe('1.5');
    expect(emit).toHaveBeenCalledWith('close');
  });
});
