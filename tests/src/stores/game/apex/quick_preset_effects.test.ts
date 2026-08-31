import {beforeEach, describe, expect, it} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import {useApexStore} from '@/stores/game/apex/index.ts';
import {
  buildDefaultGameSettingOptions,
  buildDefaultLaunchOptions,
  buildDefaultVideoOptions,
  graphicsQualityPresets,
  quickPresetGameSettingToggles,
  quickPresetLaunchOptionToggles,
  quickPresetVideoConfigToggles,
} from '@/data/presets/apex_quick_preset.ts';
import {buildApexGameSettingsMutation} from '@/stores/game/apex/actions_settings.ts';
import {
  applyQuickPresetLaunchOptions,
  applyQuickPresetVideoOptions,
  findLaunchOptionRef,
} from '@/utils/game/apex_quick_preset.ts';
import type {SteamLaunchOptionsImpl} from '@/types/steam.ts';

beforeEach(() => setActivePinia(createPinia()));

describe('Apex quick preset effect coverage', () => {
  const screen = {width: 1920, height: 1080, aspectRatio: 16 / 9, maxRefreshRate: 144};

  function prepareVideoPreset(
    graphicsPresetId: string,
    enableGraphicsPreset: boolean,
    videoOptions: Record<string, boolean>,
  ) {
    const apex = useApexStore();
    const gameSettingOptions = buildDefaultGameSettingOptions();
    gameSettingOptions.bindingOptimizations = false;
    apex.prepare_quick_preset(screen, {
      fpsCap: 144,
      aspectValue: 16 / 9,
      lockAxis: 'width',
      enableResolutionPreset: false,
      enableGraphicsPreset,
      graphicsPresetId,
      enableSimplifiedReticle: false,
      launchOptions: {},
      videoOptions,
      gameSettingOptions,
    });
    return apex.build_video_config_updates();
  }

  it('resolves and applies every launch option', () => {
    const selected: SteamLaunchOptionsImpl[] = [];
    for (const toggle of quickPresetLaunchOptionToggles) {
      expect(findLaunchOptionRef(toggle), toggle.key).toBeDefined();
    }

    applyQuickPresetLaunchOptions(selected, buildDefaultLaunchOptions());

    for (const toggle of quickPresetLaunchOptionToggles) {
      expect(selected, toggle.key).toContain(findLaunchOptionRef(toggle));
    }
  });

  it('emits every enabled video toggle value', () => {
    const updates: Record<string, string> = {};

    applyQuickPresetVideoOptions(
      (key, value) => { updates[key] = value; },
      Object.fromEntries(quickPresetVideoConfigToggles.map(toggle => [toggle.key, true])),
    );

    for (const toggle of quickPresetVideoConfigToggles) {
      for (const [key, value] of Object.entries(toggle.onValues)) {
        expect(updates[key], `${toggle.key}:${key}`).toBe(value);
      }
    }
  });

  it('keeps every graphics preset populated with finite config values', () => {
    for (const preset of graphicsQualityPresets) {
      expect(Object.keys(preset.values).length, preset.identifier).toBeGreaterThan(0);
      for (const [key, value] of Object.entries(preset.values)) {
        expect(key, preset.identifier).toMatch(/^setting\./);
        expect(Number.isFinite(Number(value)), `${preset.identifier}:${key}`).toBe(true);
      }
    }
  });

  it('carries every graphics preset value into the persisted video payload', () => {
    for (const preset of graphicsQualityPresets) {
      setActivePinia(createPinia());
      const updates = prepareVideoPreset(preset.identifier, true, {});
      for (const [key, value] of Object.entries(preset.values)) {
        expect(updates[key], `${preset.identifier}:${key}`).toBe(value);
      }
    }
  });

  it('carries every video toggle value into the persisted video payload', () => {
    for (const enabledToggle of quickPresetVideoConfigToggles) {
      setActivePinia(createPinia());
      const videoOptions = Object.fromEntries(
        quickPresetVideoConfigToggles.map(toggle => [toggle.key, toggle === enabledToggle]),
      );
      const updates = prepareVideoPreset('competitive', false, videoOptions);
      for (const [key, value] of Object.entries(enabledToggle.onValues)) {
        expect(updates[key], `${enabledToggle.key}:${key}`).toBe(value);
      }
    }
  });

  it('generates an update for every selected game setting', () => {
    const apex = useApexStore();
    const originalProfile = Object.fromEntries(
      quickPresetGameSettingToggles.map(([, key, value]) => [key, value === '0' ? '1' : '0']),
    );
    apex.game_settings_values.profile = {...originalProfile};
    apex.original_game_settings_values.profile = {...originalProfile};
    apex.game_settings_report = {
      settings: {
        path: 'settings.cfg', revision: 'settings-1', values: {},
        unknownKeys: [], backupAvailable: false,
      },
      profile: {
        path: 'profile.cfg', revision: 'profile-1', values: {...originalProfile},
        unknownKeys: [], backupAvailable: false,
      },
      bindings: [],
    };
    const gameSettingOptions = buildDefaultGameSettingOptions();
    gameSettingOptions.bindingOptimizations = false;

    apex.prepare_quick_preset(
      screen,
      {
        fpsCap: 144,
        aspectValue: 16 / 9,
        lockAxis: 'width',
        enableResolutionPreset: false,
        enableGraphicsPreset: false,
        graphicsPresetId: 'competitive',
        enableSimplifiedReticle: false,
        launchOptions: {},
        videoOptions: buildDefaultVideoOptions(),
        gameSettingOptions,
      },
    );

    const mutation = buildApexGameSettingsMutation(apex);
    expect(mutation?.profileUpdates).toEqual(Object.fromEntries(
      quickPresetGameSettingToggles.map(([, key, value]) => [key, value]),
    ));
  });
});
