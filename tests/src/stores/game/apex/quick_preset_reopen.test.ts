import {afterEach, describe, expect, it} from 'vitest';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPinia, setActivePinia} from 'pinia';
import {useSteamStore} from '@/stores/game/steam.ts';
import {useEaStore} from '@/stores/game/ea.ts';
import {useApexStore} from '@/stores/game/apex/index.ts';
import {
  quickPresetLaunchOptionToggles, quickPresetVideoConfigToggles,
  quickPresetGameSettingToggles, quickPresetBindingToggles,
} from '@/data/presets/apex_quick_preset.ts';
import {
  initLaunchOptionsForDialog, initVideoOptionsForDialog, initGameSettingOptionsForDialog,
} from '@/utils/game/apex_quick_preset.ts';
import {parseApexLaunchOptionsString} from '@/utils/game/apex_launch_parse.ts';
import {gameOnlyPreset, presetStore, quickPresetScreen} from './quick_preset_test_helpers.ts';

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(path => rmSync(path, {recursive: true, force: true})));

function selectAccount(kind: 'steam' | 'ea') {
  const user = {id: '1', name: 'Test', avatar: '', config_path: 'test.cfg', user_userid: '1', nu_hash: ''};
  if (kind === 'steam') useSteamStore().steam_users = [user];
  else useEaStore().ea_desktop_users = [user];
  useApexStore().set_active_apex_account({kind, user});
}

const launchKeys = quickPresetLaunchOptionToggles.map(toggle => toggle.key);
const videoKeys = quickPresetVideoConfigToggles.map(toggle => toggle.key);
const gameKeys = [
  ...quickPresetGameSettingToggles.map(([id]) => id),
  ...quickPresetBindingToggles.map(toggle => toggle.key),
];
const options = [
  'all', 'reticle',
  ...launchKeys.map(key => `launch:${key}`),
  ...videoKeys.map(key => `video:${key}`),
  ...gameKeys.map(key => `game:${key}`),
];

describe.each(['steam', 'ea'] as const)('%s quick preset reopened from serialized state', kind => {
  it.each(options)('restores %s after writing, disposing and reopening twice', option => {
    setActivePinia(createPinia());
    const store = presetStore(Object.fromEntries(quickPresetGameSettingToggles.map(([, key, value]) => [key, value === '0' ? '1' : '0'])));
    selectAccount(kind);
    const selected = (group: string, keys: string[]) => Object.fromEntries(keys.map(key => [key, option === 'all' || option === `${group}:${key}`]));
    const selection = {
      ...gameOnlyPreset(selected('game', gameKeys)),
      enableSimplifiedReticle: option === 'all' || option === 'reticle',
      enableResolutionPreset: option === 'all', enableGraphicsPreset: option === 'all',
      launchOptions: selected('launch', launchKeys), videoOptions: selected('video', videoKeys),
    };
    store.custom_launch_options = '+exec "custom settings.cfg"';
    store.prepare_quick_preset(quickPresetScreen, selection);
    if (selection.enableSimplifiedReticle) {
      expect(store.launch_options).toContain(kind === 'steam'
        ? '+reticle_color "2147483648 2147483648 2147483648"'
        : '+reticle_color 2147483648-2147483648-2147483648');
    }
    if (selection.launchOptions.fov_scale) {
      expect(store.launch_options).toContain(kind === 'steam'
        ? '+cl_fovScale "1.7"' : '+cl_fovScale 1.7');
    }
    const directory = mkdtempSync(join(tmpdir(), 'mxtools-reopen-'));
    directories.push(directory);
    const launchPath = join(directory, 'launch.txt');
    writeFileSync(launchPath, store.launch_options);
    // The native writer has its own binding serialization tests. This fixture
    // models its parsed readback; launcher text goes through the actual parser.
    const reportPath = join(directory, 'readback.json');
    writeFileSync(reportPath, JSON.stringify({
      video: store.video_config_values, profile: store.game_settings_values.profile,
      bindings: store.game_settings_bindings.filter(binding => binding.input),
    }));
    for (let reopen = 0; reopen < 2; reopen++) {
      setActivePinia(createPinia());
      selectAccount(kind);
      const fresh = useApexStore();
      fresh.parse_loaded_launch_string(readFileSync(launchPath, 'utf8'));
      const readback = JSON.parse(readFileSync(reportPath, 'utf8'));
      expect(fresh.options_selection.some(item => item.identifier === 'reticle_color'))
        .toBe(selection.enableSimplifiedReticle);
      expect(initLaunchOptionsForDialog(fresh.options_selection)).toEqual(selection.launchOptions);
      expect(initVideoOptionsForDialog(readback.video)).toEqual(selection.videoOptions);
      expect(initGameSettingOptionsForDialog(readback.profile, readback.bindings)).toEqual(selection.gameSettingOptions);
      expect(fresh.custom_launch_options).toBe('+exec "custom settings.cfg"');
      expect(fresh.fps).toBe(144);
      if (option === 'all') {
        expect(fresh.width).toBe(1920);
        expect(fresh.height).toBe(1080);
        expect(fresh.mat_letterbox_aspect_goal).toBe(16 / 9);
      }
      writeFileSync(launchPath, fresh.launch_options);
    }
  });
});

describe('Reticle readback boundaries', () => {
  it.each([
    '+reticle_color "255 255 255"',
    '+exec "+reticle_color 2147483648-2147483648-2147483648"',
    '+exec +reticle_color 2147483648-2147483648-2147483648',
    '+reticle_color "2147483648 2147483648 2147483648',
  ])('keeps non-preset or protected input unchanged: %s', source => {
    const parsed = parseApexLaunchOptionsString(source);
    expect(parsed.selection.some(item => item.identifier === 'reticle_color')).toBe(false);
    expect(parsed.customLaunchOptions).toBe(source);
  });
});
