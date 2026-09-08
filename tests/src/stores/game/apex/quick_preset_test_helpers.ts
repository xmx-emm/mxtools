import {useApexStore} from '@/stores/game/apex/index.ts';
import {adoptApexGameSettingsReport} from '@/stores/game/apex/actions_settings.ts';
import {quickPresetVideoConfigToggles} from '@/data/presets/apex_quick_preset.ts';
import type {ApexBinding} from '@/types/apex_game_settings.ts';
import type {ApexQuickPresetSelection} from '@/types/apex_quick_preset.ts';

export const quickPresetScreen = {
  width: 1920, height: 1080, aspectRatio: 16 / 9, maxRefreshRate: 144,
};

export function gameOnlyPreset(gameSettingOptions: Record<string, boolean>): ApexQuickPresetSelection {
  return {
    fpsCap: 144,
    aspectValue: 16 / 9,
    lockAxis: 'width',
    enableResolutionPreset: false,
    enableGraphicsPreset: false,
    graphicsPresetId: 'competitive',
    enableSimplifiedReticle: false,
    launchOptions: {},
    videoOptions: Object.fromEntries(quickPresetVideoConfigToggles.map(toggle => [toggle.key, false])),
    gameSettingOptions,
  };
}

export function presetStore(profile: Record<string, string>, bindings: ApexBinding[] = []) {
  const store = useApexStore();
  store.video_config_values = {'setting.configversion': '10'};
  store.original_video_config = {'setting.configversion': '10'};
  adoptApexGameSettingsReport(store, {
    settings: {
      path: 'settings.cfg', revision: 'settings-1', exists: true,
      values: {}, unknownKeys: [], backupAvailable: false,
    },
    profile: {
      path: 'profile.cfg', revision: 'profile-1', exists: true,
      values: {...profile}, unknownKeys: [], backupAvailable: false,
    },
    bindings,
  });
  return store;
}
