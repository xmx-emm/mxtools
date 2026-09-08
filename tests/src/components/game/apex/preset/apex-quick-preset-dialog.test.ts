import {afterAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import type {Ref} from 'vue';

const mocks = vi.hoisted(() => {
  vi.stubGlobal('window', {__TAURI_INTERNALS__: {}});
  return {
    getPrimaryDisplayInfo: vi.fn(), getApexLaunchOption: vi.fn(), getApexLaunchOptionEa: vi.fn(),
    getApexVideoConfig: vi.fn(), getApexGameSettings: vi.fn(),
  };
});
vi.mock('@/ipc/commands.ts', async () => ({...await vi.importActual<typeof import('@/ipc/commands.ts')>('@/ipc/commands.ts'), ...mocks}));
vi.mock('vue-i18n', async () => ({...await vi.importActual<typeof import('vue-i18n')>('vue-i18n'), useI18n: () => ({t: (key: string) => key})}));
vi.mock('vue-toastification', () => ({useToast: () => ({error: vi.fn(), warning: vi.fn(), info: vi.fn()})}));
vi.mock('vue', async () => ({...await vi.importActual<typeof import('vue')>('vue'), onMounted: vi.fn(), onBeforeUnmount: vi.fn(), useSSRContext: () => ({modules: new Set()})}));
vi.mock('@/components/game/common/CloseRunningProcessesDialog.vue', () => ({default: {}}));
vi.mock('@/components/game/apex/common/ApexNumberInput.vue', () => ({default: {}}));
vi.mock('@/components/game/apex/settings/ApexGameSettingTip.vue', () => ({default: {}}));
vi.mock('vuetify/components/VAlert', () => ({VAlert: {}}));
vi.mock('vuetify/components/VBtn', () => ({VBtn: {}}));
vi.mock('vuetify/components/VBtnToggle', () => ({VBtnToggle: {}}));
vi.mock('vuetify/components/VCheckbox', () => ({VCheckbox: {}}));
vi.mock('vuetify/components/VDialog', () => ({VDialog: {}}));
vi.mock('vuetify/components/VProgressLinear', () => ({VProgressLinear: {}}));
vi.mock('vuetify/components/transitions', () => ({VExpandTransition: {}}));
vi.mock('@/composables/useCloseLauncherThenApply.ts', async () => {
  const {ref} = await import('vue');
  return {detectRunningProcesses: vi.fn(), useCloseLauncherThenApply: () => ({
    dialog: ref(false), close_processes: ref([]), is_thoroughly_kill: ref(false),
    is_apply_running: ref(false), apply_check: vi.fn(), force_close_launcher: vi.fn(), cancel: vi.fn(),
  })};
});

import {useSteamStore} from '@/stores/game/steam.ts';
import {useEaStore} from '@/stores/game/ea.ts';
import {graphicsQualityPresets} from '@/data/presets/apex_quick_preset.ts';
import {presetStore, quickPresetScreen} from '../../../../stores/game/apex/quick_preset_test_helpers.ts';
import Component from '@/components/game/apex/preset/ApexQuickPresetDialog.vue';

type DialogState = {
  fps_cap: Ref<number>; graphics_preset_id: Ref<string>; simplified_reticle: Ref<boolean>;
  display_loading: Ref<boolean>; is_apply_running: Ref<boolean>; select_all_options(): void;
  refresh_config(silent: boolean): Promise<void>; refresh_if_config_changed(): Promise<void>;
};

function readyStore(kind: 'steam' | 'ea') {
  const store = presetStore({});
  const user = {id: '1', name: 'Fixture', avatar: '', config_path: 'fixture.cfg', user_userid: '1', nu_hash: ''};
  if (kind === 'steam') useSteamStore().steam_users = [user];
  else useEaStore().ea_desktop_users = [user];
  store.set_active_apex_account({kind, user});
  store.parse_loaded_launch_string('+fps_max 237 +lobby_max_fps 237');
  store.launch_loaded_for_key = `${kind}:1`;
  store.launch_load_status = 'ready';
  store.video_config_values = {
    ...graphicsQualityPresets.find(p => p.identifier === 'ultra')!.values,
    'setting.configversion': '10',
  };
  store.video_config_loaded = true;
  store.video_config_load_status = 'ready';
  mocks.getPrimaryDisplayInfo.mockResolvedValue(quickPresetScreen);
  mocks.getApexLaunchOption.mockResolvedValue(store.launch_options);
  mocks.getApexLaunchOptionEa.mockResolvedValue(store.launch_options);
  mocks.getApexVideoConfig.mockResolvedValue(store.video_config_values);
  mocks.getApexGameSettings.mockResolvedValue(store.game_settings_report);
  return store;
}

async function setupDialog() {
  const setup = (Component as unknown as {setup(p: object, c: {expose: () => void}): DialogState}).setup;
  const state = setup({}, {expose: vi.fn()});
  await vi.waitFor(() => expect(state.display_loading.value).toBe(false));
  return state;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('document', {visibilityState: 'visible'});
  setActivePinia(createPinia());
});
afterAll(() => vi.unstubAllGlobals());

describe.each(['steam', 'ea'] as const)('%s quick preset dialog', kind => {
  it('opens with the saved FPS and graphics level', async () => {
    readyStore(kind);
    const state = await setupDialog();
    expect(state.fps_cap.value).toBe(237);
    expect(state.graphics_preset_id.value).toBe('ultra');
  });

  it.each(['refresh_config', 'refresh_if_config_changed'] as const)('keeps all selections during launcher wait: %s', async refresh => {
    const store = readyStore(kind);
    const state = await setupDialog();
    const loaders = ['load_launch_data', 'load_apex_video_config', 'load_apex_game_settings'] as const;
    for (const load of loaders) store[load] = vi.fn().mockResolvedValue(undefined);
    vi.clearAllMocks();
    state.select_all_options();
    state.is_apply_running.value = true;
    if (refresh === 'refresh_config') await state.refresh_config(true);
    else await state.refresh_if_config_changed();
    expect(state.simplified_reticle.value).toBe(true);
    for (const load of loaders) expect(store[load]).not.toHaveBeenCalled();
    expect(mocks.getApexVideoConfig).not.toHaveBeenCalled();
    state.is_apply_running.value = false;
    await state.refresh_config(true);
    expect(state.simplified_reticle.value).toBe(false);
  });
});
