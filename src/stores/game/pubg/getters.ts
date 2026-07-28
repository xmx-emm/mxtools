import {useSteamStore} from '@/stores/game/steam.ts';
import {buildPubgLaunchOptionsString} from './parse.ts';
import type {PubgState} from './state.ts';

export type PubgGetters = {
  max_mem_display_value: (state: PubgState) => number;
  max_mem_display_max: (state: PubgState) => number;
  max_mem_display_step: (state: PubgState) => number;
  launch_options: (state: PubgState) => string;
  is_launch_options_modified: (state: PubgState) => boolean;
};

export const pubgGetters: PubgGetters = {
  max_mem_display_value(state): number {
    if (state.max_mem_unit === 'gb') return Number((state.max_mem / 1024).toFixed(2));
    return state.max_mem;
  },
  max_mem_display_max(state): number {
    if (state.max_mem_unit === 'gb') {
      return Number((state.max_mem_safe_limit_mb / 1024).toFixed(2));
    }
    return state.max_mem_safe_limit_mb;
  },
  max_mem_display_step(state): number {
    return state.max_mem_unit === 'gb' ? 0.25 : 256;
  },
  launch_options(state) {
    return buildPubgLaunchOptionsString({
      options_selection: state.options_selection,
      settings_config: state.settings_config,
      parameter_overrides: state.parameter_overrides,
      max_mem: state.max_mem,
      max_mem_safe_limit_mb: state.max_mem_safe_limit_mb,
      refresh_rate: state.refresh_rate,
      res_width: state.res_width,
      res_height: state.res_height,
      view_distance_scale: state.view_distance_scale,
    });
  },
  is_launch_options_modified(this: { launch_options: string }, state): boolean {
    // 磁盘上原本就是空启动项时 original 也为 ''，仍应能检测勾选后的变更
    const user_id = useSteamStore().active_steam_user?.id ?? null;
    if (!user_id || state.launch_loaded_for_user_id !== user_id) {
      return false;
    }
    return this.launch_options !== state.original_launch_options;
  },
};
