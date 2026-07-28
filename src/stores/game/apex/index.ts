import {defineStore} from 'pinia';
import {createApexState} from './state.ts';
import {apexAccountActions} from './actions_accounts.ts';
import {apexLaunchActions} from './actions_launch.ts';
import {apexVideoActions} from './actions_video.ts';
import {apexSettingsActions} from './actions_settings.ts';
import {apexPresetActions} from './actions_preset.ts';
import {apexSnapshotActions} from './actions_snapshot.ts';
import {apexMilesActions} from './actions_miles.ts';
import {apexGetters} from './getters.ts';
export type {
  ApexActions,
  ApexGetters,
  ApexState,
  ApexStore,
  ApexStoreThis,
  ApexVideoWindowMode,
} from './types.ts';

export const useApexStore = defineStore('apex', {
  state: createApexState,
  actions: {
    ...apexMilesActions,
    ...apexLaunchActions,
    ...apexAccountActions,
    ...apexVideoActions,
    ...apexSettingsActions,
    ...apexPresetActions,
    ...apexSnapshotActions,
  },
  getters: apexGetters,
  tauri: {
    autoStart: true,
    filterKeysStrategy: 'pick',
    filterKeys: [
      'launcher_selection_key',
      'page_type',
      'filter_type',
      'filter_search',
      'video_filter_type',
      'video_filter_search',
      'video_individual_input',
      'game_settings_section',
      'game_settings_filter_search',
    ],
    // 搜索框逐字输入会改 filter_*；防抖同步，避免拖慢列表过滤动画
    syncStrategy: 'debounce',
    syncInterval: 400,
    saveStrategy: 'debounce',
    saveInterval: 600,
  },
});
