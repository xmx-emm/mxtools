import {beforeEach, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import {ref} from 'vue';
import {emitApexConfigChanged} from '@/utils/game/apex_config_events.ts';
import {useApexStore} from '@/stores/game/apex.ts';

vi.mock('vue', async () => ({...await vi.importActual('vue'), useSSRContext: () => ({modules: new Set()})}));
vi.mock('vue-i18n', async () => ({...await vi.importActual('vue-i18n'), useI18n: () => ({t: (key: string) => key})}));
vi.mock('vue-toastification', () => ({useToast: () => ({error: vi.fn(), warning: vi.fn()})}));
vi.mock('@/utils/game/apex_config_events.ts', () => ({emitApexConfigChanged: vi.fn().mockResolvedValue(undefined)}));
vi.mock('@/composables/useCloseLauncherThenApply.ts', () => ({detectRunningProcesses: vi.fn(),
  useCloseLauncherThenApply: () => ({is_apply_running: ref(false)})}));
import Component from '@/components/game/apex/preset/ApexConfigImportPage.vue';
vi.mock('vuetify/components/VCard', () => ({VCard: {}, VCardText: {}, VCardActions: {}}));
vi.mock('vuetify/components/VBtn', () => ({VBtn: {}}));
vi.mock('vuetify/components/VBtnToggle', () => ({VBtnToggle: {}}));
vi.mock('vuetify/components/VCheckbox', () => ({VCheckbox: {}}));
vi.mock('vuetify/components/VGrid', () => ({VSpacer: {}}));
vi.mock('@/components/game/common/CloseRunningProcessesDialog.vue', () => ({default: {}}));
vi.mock('@/components/game/apex/preset/ApexSnapshotSection.vue', () => ({default: {}}));

beforeEach(() => {setActivePinia(createPinia()); vi.clearAllMocks();});

it.each([true, false])('notifies the main window before closing only after a successful import (%s)', async ok => {
  const store = useApexStore();
  store.config_import_snapshot = {kind: 'apex-config-snapshot', version: 1, exportedAt: '',
    gameSettings: {settings: {}, profile: {}, bindings: []}};
  vi.spyOn(store, 'apply_config_snapshot').mockResolvedValue(ok);
  const emit = vi.fn();
  const state = (Component as unknown as {setup(props: object, context: object): {
    run_apply(): Promise<void>;
  }}).setup({}, {emit, expose: vi.fn()});
  await state.run_apply();
  if (ok) {
    expect(emitApexConfigChanged).toHaveBeenCalledWith(['launch', 'video', 'gameSettings'], {notification: 'snapshotImported'});
    expect(emit).toHaveBeenCalledWith('close');
    expect(vi.mocked(emitApexConfigChanged).mock.invocationCallOrder[0]).toBeLessThan(
      emit.mock.invocationCallOrder[emit.mock.invocationCallOrder.length - 1],
    );
  } else {
    expect(emitApexConfigChanged).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalledWith('close');
  }
});
