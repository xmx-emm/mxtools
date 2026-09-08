import {describe, expect, it} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import {
  aspectPresets, graphicsQualityPresets, quickPresetVideoConfigToggles,
} from '@/data/presets/apex_quick_preset.ts';
import {resolveQuickPresetInitialControls} from '@/utils/game/apex_quick_preset.ts';
import {useSteamStore} from '@/stores/game/steam.ts';
import {useEaStore} from '@/stores/game/ea.ts';
import {gameOnlyPreset, presetStore, quickPresetScreen} from '../../stores/game/apex/quick_preset_test_helpers.ts';

function setup(kind: 'steam' | 'ea') {
  setActivePinia(createPinia());
  const store = presetStore({});
  const user = {id: '1', name: 'Fixture', avatar: '', config_path: 'fixture.cfg', user_userid: '1', nu_hash: ''};
  if (kind === 'steam') useSteamStore().steam_users = [user];
  else useEaStore().ea_desktop_users = [user];
  store.set_active_apex_account({kind, user});
  return store;
}

describe.each(['steam', 'ea'] as const)('%s quick preset control readback', kind => {
  it.each(graphicsQualityPresets.map(preset => preset.identifier))('recovers %s and the saved FPS with independent video toggles', graphicsPresetId => {
    for (const selected of [true, false]) {
      const store = setup(kind);
      store.prepare_quick_preset(quickPresetScreen, {
        ...gameOnlyPreset({}), fpsCap: 237, enableGraphicsPreset: true, graphicsPresetId,
        videoOptions: Object.fromEntries(quickPresetVideoConfigToggles.map(option => [option.key, selected])),
      });
      const video = {...store.video_config_values};
      const launch = store.launch_options;
      const fresh = setup(kind);
      fresh.parse_loaded_launch_string(launch);
      const controls = resolveQuickPresetInitialControls(quickPresetScreen, fresh, video);
      expect(controls.fpsCap).toBe(237);
      expect(controls.enableGraphicsPreset).toBe(true);
      expect(controls.graphicsPresetId).toBe(graphicsPresetId);
    }
  });

  it.each(aspectPresets.map(preset => preset.aspectValue))('recovers both resolution axes for aspect %s', aspectValue => {
    for (const lockAxis of ['width', 'height'] as const) {
      const store = setup(kind);
      store.prepare_quick_preset(quickPresetScreen, {
        ...gameOnlyPreset({}), aspectValue, lockAxis, enableResolutionPreset: true,
      });
      const video = {...store.video_config_values};
      const fresh = setup(kind);
      fresh.parse_loaded_launch_string(store.launch_options);
      const controls = resolveQuickPresetInitialControls(quickPresetScreen, fresh, video);
      expect(controls.enableResolutionPreset).toBe(true);
      expect(controls.aspectValue).toBe(aspectValue);
      // At the native aspect both axes produce identical dimensions.
      if (aspectValue !== 1.7778) expect(controls.lockAxis).toBe(lockAxis);
      const originalResolution = {width: fresh.width, height: fresh.height};
      fresh.prepare_quick_preset(quickPresetScreen, {...gameOnlyPreset({}), ...controls, aspectValue});
      expect({width: fresh.width, height: fresh.height}).toEqual(originalResolution);
    }
  });

  it('requires matching launcher and all video resolution fields', () => {
    const store = setup(kind);
    store.prepare_quick_preset(quickPresetScreen, {...gameOnlyPreset({}), enableResolutionPreset: true});
    const complete = {...store.video_config_values};
    for (const key of Object.keys(complete)) {
      const incomplete = {...complete};
      delete incomplete[key];
      expect(resolveQuickPresetInitialControls(quickPresetScreen, store, incomplete).enableResolutionPreset).toBe(false);
    }
    store.mat_letterbox_aspect_min = 1.59;
    expect(resolveQuickPresetInitialControls(quickPresetScreen, store, complete).enableResolutionPreset).toBe(false);
    store.parse_loaded_launch_string('');
    expect(resolveQuickPresetInitialControls(quickPresetScreen, store, complete).enableResolutionPreset).toBe(false);
  });

  it('does not identify empty or custom video values as a graphics preset', () => {
    const store = setup(kind);
    for (const values of [{}, {...graphicsQualityPresets[0]!.values, 'setting.stream_memory': '350000'}]) {
      expect(resolveQuickPresetInitialControls(quickPresetScreen, store, values).enableGraphicsPreset).toBe(false);
    }
  });

  it('uses monitor FPS only when no supported cap exists, without reusing stale values', () => {
    const store = setup(kind);
    store.parse_loaded_launch_string('+fps_max 237 +lobby_max_fps 237');
    for (const launch of ['', '+fps_max unlimited', '+fps_max 0', '+fps_max adaptive']) {
      store.parse_loaded_launch_string(launch);
      expect(resolveQuickPresetInitialControls(quickPresetScreen, store, {}).fpsCap).toBe(144);
    }
    store.parse_loaded_launch_string('+lobby_max_fps 120');
    expect(resolveQuickPresetInitialControls(quickPresetScreen, store, {}).fpsCap).toBe(120);
  });
});
