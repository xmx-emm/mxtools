import type {SteamLaunchOptionsImpl} from '@/types/steam.ts';
import type {Component} from 'vue';

export function createPubgState() {
  return {
    is_start_loading: false,
    is_accounts_loading: false,
    options_selection: <SteamLaunchOptionsImpl[]>[],
    // 通过“重命名 Content/Movies 目录”来禁用/恢复 PUBG 开场动画。
    skip_intro_movies_disabled: false,
    is_skip_intro_movies_loading: false,
    settings_config: <Record<string, string>>({
      window: '-fullscreen',
      graphics_api: 'dx11',
    }),
    max_mem_unit: <'mb' | 'gb'>'gb',
    max_mem_safe_limit_mb: 8192,
    max_mem: 0,
    refresh_rate: 144,
    res_width: 1920,
    res_height: 1080,
    view_distance_scale: 0.8,
    parameter_overrides: <{ [key: string]: string[] }>{},
    original_launch_options: '',
    launch_loaded_for_user_id: <string | null>null,
    tip_view: <Component | null | undefined>null,
    tip_dialog: false,
  };
}

export type PubgState = ReturnType<typeof createPubgState>;
