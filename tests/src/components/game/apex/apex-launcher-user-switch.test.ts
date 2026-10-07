import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  toast: {error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn()},
}));
vi.mock('@/utils/app_confirmation.ts', () => ({confirm: mocks.confirm}));
vi.mock('vue-toastification', () => ({useToast: () => mocks.toast}));
vi.mock('vue-i18n', async () => ({...await vi.importActual<typeof import('vue-i18n')>('vue-i18n'), useI18n: () => ({t: (key: string) => key})}));
vi.mock('vue', async () => ({...await vi.importActual<typeof import('vue')>('vue'), useSSRContext: () => ({modules: new Set()})}));
vi.mock('@tauri-apps/api/core', () => ({convertFileSrc: (path: string) => path}));
vi.mock('@/components/icons/EAIcon.vue', () => ({default: {}}));
vi.mock('vuetify/components/VAvatar', () => ({VAvatar: {}}));
vi.mock('vuetify/components/VBtn', () => ({VBtn: {}}));
vi.mock('vuetify/components/VIcon', () => ({VIcon: {}}));
vi.mock('vuetify/components/VImg', () => ({VImg: {}}));
vi.mock('vuetify/components/VList', () => ({
  VList: {}, VListItem: {}, VListItemSubtitle: {}, VListItemTitle: {},
}));
vi.mock('vuetify/components/VMenu', () => ({VMenu: {}}));
vi.mock('@/composables/useCloseLauncherThenApply.ts', () => ({
  formatApplyLaunchOptionError: (err: unknown) => `toast.applyLaunchOptionError\n${String(err)}`,
}));

import {useApexStore} from '@/stores/game/apex.ts';
import {useSteamStore} from '@/stores/game/steam.ts';
import type {ApexLauncherAccount} from '@/types/apex.ts';
import Component from '@/components/game/apex/ApexLauncherUser.vue';

type UserState = {selectAccount(acc: ApexLauncherAccount): Promise<void>};

const user = (id: string) => ({id, name: id, avatar: '', config_path: `${id}.vdf`});
const first: ApexLauncherAccount = {kind: 'steam', user: user('1')};
const second: ApexLauncherAccount = {kind: 'steam', user: user('2')};

function setupUser() {
  const emit = vi.fn();
  const setup = (Component as unknown as {
    setup(p: object, c: {expose: () => void; emit: typeof emit}): UserState;
  }).setup;
  return {state: setup({}, {expose: vi.fn(), emit}), emit};
}

function modifiedStore() {
  const store = useApexStore();
  useSteamStore().steam_users = [first.user, second.user];
  store.set_active_apex_account(first);
  store.parse_loaded_launch_string('+fps_max 144');
  store.original_launch_options = store.launch_options;
  store.launch_loaded_for_key = 'steam:1';
  store.launch_load_status = 'ready';
  store.parse_loaded_launch_string('+fps_max 240');
  expect(store.is_launch_options_modified).toBe(true);
  store.check_miles_language = vi.fn().mockResolvedValue(true);
  store.persist_launch_options = vi.fn().mockResolvedValue(undefined);
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
});

describe('Apex launcher account switch guard', () => {
  it('switches directly when launch options are unchanged', async () => {
    const store = useApexStore();
    useSteamStore().steam_users = [first.user, second.user];
    store.set_active_apex_account(first);
    const {state, emit} = setupUser();
    await state.selectAccount(second);
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(store.launcher_selection_key).toBe('steam:2');
    expect(emit).toHaveBeenCalledWith('update_user');
  });

  it('stays on the current account when the prompt is cancelled', async () => {
    const store = modifiedStore();
    mocks.confirm.mockResolvedValue(false);
    const {state, emit} = setupUser();
    await state.selectAccount(second);
    expect(store.persist_launch_options).not.toHaveBeenCalled();
    expect(store.launcher_selection_key).toBe('steam:1');
    expect(emit).not.toHaveBeenCalled();
  });

  it('saves before switching', async () => {
    const store = modifiedStore();
    mocks.confirm.mockResolvedValue(true);
    const {state} = setupUser();
    await state.selectAccount(second);
    expect(store.persist_launch_options).toHaveBeenCalledOnce();
    expect(store.launcher_selection_key).toBe('steam:2');
  });

  it('stays on the current account when saving fails', async () => {
    const store = modifiedStore();
    mocks.confirm.mockResolvedValue(true);
    store.persist_launch_options = vi.fn().mockRejectedValue(new Error('apex.history.errors.launcherRunning'));
    const {state} = setupUser();
    await state.selectAccount(second);
    expect(mocks.toast.error).toHaveBeenCalled();
    expect(store.launcher_selection_key).toBe('steam:1');
  });

  it('discards changes and switches without saving', async () => {
    const store = modifiedStore();
    mocks.confirm.mockImplementation(async (_message: string, options: {onAction?: () => void}) => {
      options.onAction?.();
      return false;
    });
    const {state} = setupUser();
    await state.selectAccount(second);
    expect(store.persist_launch_options).not.toHaveBeenCalled();
    expect(store.launcher_selection_key).toBe('steam:2');
  });
});
