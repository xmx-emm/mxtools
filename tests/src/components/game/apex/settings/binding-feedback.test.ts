import {beforeEach, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import {ref} from 'vue';
import {useApexStore} from '@/stores/game/apex.ts';
import type {ApexBinding} from '@/types/apex_game_settings.ts';

const toast = vi.hoisted(() => ({warning: vi.fn(), error: vi.fn()}));
vi.mock('vue-toastification', () => ({useToast: () => toast}));
vi.mock('vue', async () => ({...await vi.importActual('vue'), onMounted: vi.fn(), onBeforeUnmount: vi.fn(),
  useSSRContext: () => ({modules: new Set()})}));
vi.mock('vue-i18n', async () => ({...await vi.importActual('vue-i18n'), useI18n: () => ({locale: ref('zh-CN'), te: () => false,
  t: (key: string, params: unknown) => JSON.stringify({key, params})})}));
import Component from '@/components/game/apex/settings/ApexGameSettings.vue';
vi.mock('vuetify/components/VBtn', () => ({VBtn: {}}));
vi.mock('vuetify/components/VBtnToggle', () => ({VBtnToggle: {}}));
vi.mock('vuetify/components/VChip', () => ({VChip: {}}));
vi.mock('vuetify/components/VIcon', () => ({VIcon: {}}));
vi.mock('vuetify/components/VList', () => ({VList: {}, VListItem: {}}));
vi.mock('vuetify/components/VSwitch', () => ({VSwitch: {}}));
vi.mock('vuetify/components/VTextField', () => ({VTextField: {}}));
vi.mock('@/components/game/apex/common/ApexNumberInput.vue', () => ({default: {}}));
vi.mock('@/components/game/apex/common/ApexRangeInput.vue', () => ({default: {}}));
vi.mock('@/components/game/apex/settings/ApexBindingSelect.vue', () => ({default: {}}));
vi.mock('@/components/game/apex/settings/ApexGameSettingTip.vue', () => ({default: {}}));
vi.mock('@/components/game/apex/settings/ApexLaserSightColorInput.vue', () => ({default: {}}));

beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks(); });

function setup(editable = true) {
  const store = useApexStore();
  store.game_settings_bindings = [
    {id: 'jump', command: '+jump', input: 'SPACE', context: 0, occurrence: 0, editable: true, heldCommand: null},
    {id: 'forward', command: '+forward', input: 'w', context: 1, occurrence: 0, editable, heldCommand: null},
  ];
  const target = store.game_settings_bindings[0];
  const state = (Component as unknown as {setup(props: object, context: object): {
    updateBinding(action: {template: ApexBinding; slots: ApexBinding[]}, slot: number, input: string): void;
  }}).setup({}, {expose: vi.fn()});
  return {store, update: (input: string) => state.updateBinding({template: target, slots: [target]}, 0, input)};
}

it('warns with old and new actions after taking over the other slot', () => {
  const {store, update} = setup();
  update('W');
  expect(store.game_settings_bindings.map(binding => binding.input)).toEqual(['W', '']);
  expect(toast.warning).toHaveBeenCalledWith(JSON.stringify({key: 'apexGameSettings.bindingReassigned',
    params: {key: 'W', previous: '+forward', action: '+jump'}}), {timeout: 6000});
});

it('does not report a replacement for free inputs or an unchanged binding', () => {
  const {update} = setup();
  update('SPACE');
  update('F');
  expect(toast.warning).not.toHaveBeenCalled();
});

it('protects noneditable bindings and reports the conflict instead', () => {
  const {store, update} = setup(false);
  update('W');
  expect(store.game_settings_bindings.map(binding => binding.input)).toEqual(['SPACE', 'w']);
  expect(toast.error).toHaveBeenCalledOnce();
  expect(toast.warning).not.toHaveBeenCalled();
});
