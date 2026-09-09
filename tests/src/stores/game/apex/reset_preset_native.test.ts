import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPinia, setActivePinia} from 'pinia';
import type {ApexConfigMutationRequest, ApexConfigMutationResult, ApexResetResult} from '@/types/apex_history.ts';
import {buildDefaultGameSettingOptions, quickPresetLaunchOptionToggles, quickPresetVideoConfigToggles} from '@/data/presets/apex_quick_preset.ts';
import {initGameSettingOptionsForDialog, initLaunchOptionsForDialog, initVideoOptionsForDialog, resolveQuickPresetInitialControls} from '@/utils/game/apex_quick_preset.ts';

const mocks = vi.hoisted(() => ({
  resetApexToGameDefaults: vi.fn(), getApexLaunchOption: vi.fn(), getApexLaunchOptionEa: vi.fn(),
  getApexGameSettings: vi.fn(), getApexVideoConfig: vi.fn(), getApexVideoconfigReadonly: vi.fn(),
  setApexVideoconfigReadonly: vi.fn(), mutateApexConfig: vi.fn(), apexIsRunning: vi.fn(),
  emitApexConfigChanged: vi.fn(),
}));
vi.mock('@/ipc/commands.ts', async () => ({
  ...await vi.importActual<typeof import('@/ipc/commands.ts')>('@/ipc/commands.ts'), ...mocks,
}));
vi.mock('@/utils/game/apex_config_events.ts', () => ({emitApexConfigChanged: mocks.emitApexConfigChanged}));
vi.mock('vue-toastification', () => ({useToast: () => ({error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn()})}));

import {useSteamStore} from '@/stores/game/steam.ts';
import {useEaStore} from '@/stores/game/ea.ts';
import {gameOnlyPreset, presetStore, quickPresetScreen} from './quick_preset_test_helpers.ts';

const nativeExe = process.env.MXTOOLS_APEX_VIDEO_TEST_EXE;
let root: string;
type NativeReadback = ApexConfigMutationResult & {readonly: boolean};

function native<T>(kind: string, operation: string, extra = {}): T {
  writeFileSync(join(root, 'reset-request.json'), JSON.stringify({kind, operation, ...extra}));
  execFileSync(nativeExe!, ['--exact', 'game::apex_history::tests::reset_preset_native_bridge', '--ignored'], {
    env: {...process.env, USERPROFILE: root, MXTOOLS_VIDEO_TEST_ROOT: root}, windowsHide: true, timeout: 10000,
  });
  return JSON.parse(readFileSync(join(root, 'reset-result.json'), 'utf8')) as T;
}

function freshStore(kind: 'steam' | 'ea') {
  setActivePinia(createPinia());
  const store = presetStore({});
  const user = {id: '1', name: 'Test', avatar: '', config_path: 'test.cfg', user_userid: '1', nu_hash: ''};
  if (kind === 'steam') useSteamStore().steam_users = [user];
  else useEaStore().ea_desktop_users = [user];
  store.set_active_apex_account({kind, user});
  store.check_miles_language = vi.fn().mockResolvedValue(true);
  store.update_download_language_button_color = vi.fn();
  store.load_config_history = vi.fn().mockResolvedValue(undefined);
  return store;
}

describe.skipIf(!nativeExe).each(['steam', 'ea'] as const)('%s reset followed by native presets', kind => {
  beforeEach(() => {
    vi.resetAllMocks();
    root = mkdtempSync(join(tmpdir(), 'mxtools-reset-preset-'));
    writeFileSync(join(root, `${kind}-launch.txt`), '+fps_max 100');
    const read = () => native<NativeReadback>(kind, 'read');
    mocks.resetApexToGameDefaults.mockImplementation(async () => native<ApexResetResult>(kind, 'reset'));
    mocks.getApexLaunchOption.mockImplementation(async () => read().launchOptions);
    mocks.getApexLaunchOptionEa.mockImplementation(async () => read().launchOptions);
    mocks.getApexVideoConfig.mockImplementation(async () => read().videoConfig);
    mocks.getApexGameSettings.mockImplementation(async () => read().gameSettingsReport);
    mocks.getApexVideoconfigReadonly.mockImplementation(async () => read().readonly);
    mocks.setApexVideoconfigReadonly.mockImplementation(async ({locked}) => { native(kind, 'read', {locked}); });
    mocks.apexIsRunning.mockResolvedValue(false);
    mocks.emitApexConfigChanged.mockResolvedValue(undefined);
    mocks.mutateApexConfig.mockImplementation(async ({request}: {request: ApexConfigMutationRequest}) => native(kind, 'apply', {request}));
  });

  afterEach(() => {
    native(kind, 'read', {locked: false});
    rmSync(root, {recursive: true, force: true});
  });

  it.each(['all', ...quickPresetVideoConfigToggles.map(option => option.key)])('initializes, applies %s, reopens twice, and resets again', async selected => {
    const store = freshStore(kind);
    expect(await store.reset_apex_to_defaults()).toBe(true);
    expect(store.reset_pending_scopes).toEqual([]);
    expect(store.video_config_load_status).toBe('ready');
    expect(store.game_settings_values.profile.closecaption).toBe(kind === 'steam' ? '0' : '1');
    const baseline = {...store.video_config_values};
    const expectedVideo = initVideoOptionsForDialog(baseline);
    const all = selected === 'all';
    const videoOptions = Object.fromEntries(quickPresetVideoConfigToggles.map(option => [option.key, all || option.key === selected]));
    for (const [key, enabled] of Object.entries(videoOptions)) if (enabled) expectedVideo[key] = true;
    const gameOptions = all ? buildDefaultGameSettingOptions() : {};
    const launchOptions = Object.fromEntries(quickPresetLaunchOptionToggles.map(option => [option.key, all]));
    await store.ensure_configs_loaded_for_preset();
    store.prepare_quick_preset(quickPresetScreen, {
      ...gameOnlyPreset(gameOptions), videoOptions, launchOptions,
      enableSimplifiedReticle: all, enableResolutionPreset: all, enableGraphicsPreset: all, aspectValue: 4 / 3,
    });
    expect(await store.apply_quick_preset_persist()).toBe(true);
    const written = native<NativeReadback>(kind, 'read');
    expect(Object.keys(written.videoConfig!)).toHaveLength(42);
    expect(written.readonly).toBe(true);
    if (all) {
      expect(written.videoConfig).toMatchObject({'setting.mat_vsync_mode': '0', 'setting.shadow_enable': '0'});
      expect(written.gameSettingsReport!.bindings.some(b => b.input === 'MOUSE2' && b.command === '+zoom')).toBe(true);
    }
    const updates = mocks.mutateApexConfig.mock.calls[0]![0].request.videoUpdates as Record<string, string>;
    for (const [key, value] of Object.entries(baseline)) {
      if (!(key in updates)) expect(written.videoConfig![key], key).toBe(value);
    }
    for (let round = 0; round < 2; round += 1) {
      const fresh = freshStore(kind);
      await fresh.ensure_configs_loaded_for_preset();
      expect(initVideoOptionsForDialog(fresh.video_config_values)).toEqual(expectedVideo);
      expect(fresh.reset_pending_scopes).toEqual([]);
      if (all) {
        expect(initGameSettingOptionsForDialog(fresh.game_settings_values.profile, fresh.game_settings_bindings)).toMatchObject(gameOptions);
        expect(initLaunchOptionsForDialog(fresh.options_selection)).toEqual(launchOptions);
        expect(fresh.options_selection.some(item => item.identifier === 'reticle_color')).toBe(true);
        expect(resolveQuickPresetInitialControls(quickPresetScreen, fresh, fresh.video_config_values))
          .toMatchObject({enableResolutionPreset: true, enableGraphicsPreset: true, graphicsPresetId: 'competitive'});
      }
    }
    const resetAgain = freshStore(kind);
    expect(await resetAgain.reset_apex_to_defaults()).toBe(true);
    expect(resetAgain.video_config_values).toEqual(baseline);
    expect(resetAgain.is_videoconfig_readonly).toBe(false);
    expect(resetAgain.launch_options).toBe('');
    expect(resetAgain.game_settings_bindings.some(b => b.input === 'MOUSE2' && b.command === '+toggle_zoom')).toBe(true);
  }, 60000);
});
