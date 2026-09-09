import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {createPinia, setActivePinia} from 'pinia';
import type {ApexConfigMutationRequest} from '@/types/apex_history.ts';
import {quickPresetVideoConfigToggles} from '@/data/presets/apex_quick_preset.ts';
import {initVideoOptionsForDialog, resolveQuickPresetInitialControls} from '@/utils/game/apex_quick_preset.ts';

const mocks = vi.hoisted(() => ({
  getApexLaunchOption: vi.fn(), getApexLaunchOptionEa: vi.fn(), getApexGameSettings: vi.fn(),
  getApexVideoConfig: vi.fn(), getApexVideoconfigReadonly: vi.fn(), setApexVideoconfigReadonly: vi.fn(),
  mutateApexConfig: vi.fn(), apexIsRunning: vi.fn(), emitApexConfigChanged: vi.fn(),
}));
vi.mock('@/ipc/commands.ts', async () => ({
  ...await vi.importActual<typeof import('@/ipc/commands.ts')>('@/ipc/commands.ts'), ...mocks,
}));
vi.mock('@/utils/game/apex_config_events.ts', () => ({emitApexConfigChanged: mocks.emitApexConfigChanged}));
vi.mock('vue-toastification', () => ({useToast: () => ({error: vi.fn(), info: vi.fn()})}));

import {useSteamStore} from '@/stores/game/steam.ts';
import {useEaStore} from '@/stores/game/ea.ts';
import {gameOnlyPreset, presetStore, quickPresetScreen} from './quick_preset_test_helpers.ts';

// Supply the lib test EXE built by cargo test --lib --no-run. Each bridge call
// uses real production video I/O in a child process with its own Saved Games.
const nativeExe = process.env.MXTOOLS_APEX_VIDEO_TEST_EXE;
// All 42 J57 serialized fields, with deliberate test preferences. This is not
// a hardware-default template. Unknown keys and the CRLF form must survive.
const completeFixture = readFileSync(new URL('../../../../fixtures/apex/videoconfig-v10.txt', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\n}\s*$/, '\n\t"setting.future_setting"\t\t"keep"\n}\n')
  .replace(/\n/g, '\r\n');
let root: string;
let baselineValues: Record<string, string>;
function native(request: {updates?: Record<string, string>; locked?: boolean} = {}) {
  writeFileSync(join(root, 'video-request.json'), JSON.stringify(request));
  execFileSync(nativeExe!, ['--exact', 'game::apex::tests::video_preset_native_bridge', '--ignored'], {
    env: {...process.env, USERPROFILE: root, MXTOOLS_VIDEO_TEST_ROOT: root},
    windowsHide: true, timeout: 10000,
  });
  return JSON.parse(readFileSync(join(root, 'video-result.json'), 'utf8')) as {
    values: Record<string, string>; readonly: boolean;
  };
}

describe.skipIf(!nativeExe).each(['steam', 'ea'] as const)('%s preset through native video files', kind => {
  beforeEach(() => {
    vi.resetAllMocks();
    setActivePinia(createPinia());
    root = mkdtempSync(join(tmpdir(), 'mxtools-native-preset-'));
    const video = join(root, 'Saved Games/Respawn/Apex/local/videoconfig.txt');
    mkdirSync(dirname(video), {recursive: true});
    writeFileSync(video, completeFixture);
    baselineValues = native().values;
    expect(Object.keys(baselineValues)).toHaveLength(43);
    expect(Object.values(initVideoOptionsForDialog(baselineValues)).every(value => !value)).toBe(true);
    mocks.getApexVideoConfig.mockImplementation(async () => native().values);
    mocks.getApexVideoconfigReadonly.mockImplementation(async () => native().readonly);
    mocks.setApexVideoconfigReadonly.mockImplementation(async ({locked}) => { native({locked}); });
    mocks.getApexLaunchOption.mockResolvedValue('');
    mocks.getApexLaunchOptionEa.mockResolvedValue('');
    mocks.apexIsRunning.mockResolvedValue(false);
    mocks.emitApexConfigChanged.mockResolvedValue(undefined);
    mocks.mutateApexConfig.mockImplementation(async ({request}: {request: ApexConfigMutationRequest}) => ({
      changedScopes: ['launch', 'video'], launchOptions: request.launchOptions,
      videoConfig: native({updates: request.videoUpdates}).values,
    }));
  });
  afterEach(() => {
    native({locked: false});
    rmSync(root, {recursive: true, force: true});
  });

  it.each(['all', ...quickPresetVideoConfigToggles.map(option => option.key)])('applies and reopens %s twice', async selected => {
    const store = presetStore({});
    const user = {id: '1', name: 'Test', avatar: '', config_path: 'test.cfg', user_userid: '1', nu_hash: ''};
    if (kind === 'steam') useSteamStore().steam_users = [user];
    else useEaStore().ea_desktop_users = [user];
    store.set_active_apex_account({kind, user});
    store.check_miles_language = vi.fn().mockResolvedValue(true);
    store.update_download_language_button_color = vi.fn();
    mocks.getApexGameSettings.mockResolvedValue(store.game_settings_report);
    const videoOptions = Object.fromEntries(quickPresetVideoConfigToggles.map(option => [option.key, selected === 'all' || selected === option.key]));
    await store.ensure_configs_loaded_for_preset();
    store.prepare_quick_preset(quickPresetScreen, {
      ...gameOnlyPreset({}), videoOptions, enableResolutionPreset: selected === 'all',
      enableGraphicsPreset: selected === 'all', aspectValue: 4 / 3,
    });
    expect(await store.apply_quick_preset_persist()).toBe(true);
    expect(native().readonly).toBe(true);
    const writtenKeys = new Set(Object.keys(mocks.mutateApexConfig.mock.calls[0]![0].request.videoUpdates));
    const untouched = Object.fromEntries(Object.entries(baselineValues).filter(([key]) => !writtenKeys.has(key)));
    const launch = store.launch_options;
    for (let round = 0; round < 2; round += 1) {
      setActivePinia(createPinia());
      const fresh = presetStore({});
      fresh.parse_loaded_launch_string(launch);
      await fresh.load_apex_video_config();
      expect(initVideoOptionsForDialog(fresh.video_config_values)).toEqual(videoOptions);
      expect(Object.keys(fresh.video_config_values)).toHaveLength(43);
      expect(fresh.video_config_values).toMatchObject(untouched);
      expect(fresh.video_config_values).toMatchObject({
        'setting.configversion': '10', 'setting.new_shadow_settings': '1',
        'setting.sound_volume': '0.35', 'setting.future_setting': 'keep',
      });
      if (selected === 'all') {
        expect(resolveQuickPresetInitialControls(quickPresetScreen, fresh, fresh.video_config_values))
          .toMatchObject({enableResolutionPreset: true, enableGraphicsPreset: true, graphicsPresetId: 'competitive'});
      }
    }
  }, 60000);
});
