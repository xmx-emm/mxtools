import {useToast} from 'vue-toastification';
import PubgLaunchOptionsConfig from '@/data/pubg_launch_options_config.ts';
import {isSteamLaunchOptionsImpl, type SteamLaunchOptionsImpl} from '@/types/steam.ts';
import {useSteamStore} from '@/stores/game/steam.ts';
import {markRaw} from 'vue';
import {
  calcSafeMaxMemMb,
  clampMaxMemMb,
  normalizeTotalMemMb,
} from './helpers.ts';
import {parsePubgLaunchOptionsString} from './parse.ts';
import type {PubgState} from './state.ts';
import {
  checkPubgSkipIntroMoviesDisabled,
  getPubgLaunchOption,
  setPubgSkipIntroMoviesDisabled,
  systemTotalMemoryMb,
} from '@/ipc/commands.ts';

/** actions 内 this：state + getters + 本文件 actions（避免循环依赖手写完整 Store） */
type PubgStoreThis = PubgState & {
  launch_options: string;
  load_launch_data(): Promise<void>;
  start_load_pubg_launch_options_data(): Promise<boolean>;
  parse_loaded_launch_string(start_launch_option: string, safe_max_mem_mb: number): void;
  refresh_steam_accounts(options?: { silent?: boolean }): Promise<void>;
  sync_skip_intro_selection_with_movies_disabled(disabled: boolean): void;
};

export const pubgLaunchActions = {
  closeTip(this: PubgStoreThis) {
    this.tip_dialog = false;
  },
  showTip(this: PubgStoreThis, item: SteamLaunchOptionsImpl) {
    if (item.tip !== null && item.tip !== undefined) {
      this.tip_view = markRaw(item.tip);
      this.tip_dialog = true;
    }
  },
  start_launch(this: PubgStoreThis, force = false) {
    const user_id = useSteamStore().active_steam_user?.id ?? null;
    // 空启动项也算已加载，不能再用 original_launch_options !== '' 判断
    if (!force && user_id && this.launch_loaded_for_user_id === user_id) {
      return;
    }
    void this.load_launch_data();
  },

  async load_launch_data(this: PubgStoreThis) {
    if (this.is_start_loading) return;
    this.is_start_loading = true;
    try {
      const ok = await this.start_load_pubg_launch_options_data();
      if (ok) {
        this.original_launch_options = this.launch_options;
        this.launch_loaded_for_user_id = useSteamStore().active_steam_user?.id ?? null;
      }
    } finally {
      this.is_start_loading = false;
    }
  },

  /** 刷新 Steam 账户列表 */
  async refresh_steam_accounts(this: PubgStoreThis, options?: { silent?: boolean }) {
    if (this.is_accounts_loading) return;
    const silent = options?.silent ?? false;
    if (!silent) {
      this.is_accounts_loading = true;
    }
    try {
      await useSteamStore().refresh_users({ silent });
    } finally {
      if (!silent) {
        this.is_accounts_loading = false;
      }
    }
  },

  /** 刷新账户列表并重新加载启动项(与 Apex reload_launch_page 一致) */
  async reload_launch_page(this: PubgStoreThis) {
    if (this.is_start_loading) return;
    this.is_start_loading = true;
    try {
      await this.refresh_steam_accounts({ silent: true });
      const ok = await this.start_load_pubg_launch_options_data();
      if (ok) {
        this.original_launch_options = this.launch_options;
        this.launch_loaded_for_user_id = useSteamStore().active_steam_user?.id ?? null;
      }
    } finally {
      this.is_start_loading = false;
    }
  },

  parse_loaded_launch_string(this: PubgStoreThis, start_launch_option: string, safe_max_mem_mb: number) {
    const parsed = parsePubgLaunchOptionsString(start_launch_option, safe_max_mem_mb);
    this.max_mem_safe_limit_mb = safe_max_mem_mb;
    this.options_selection = parsed.selection;
    this.parameter_overrides = parsed.parameter_overrides;
    const selectedIds = new Set(parsed.selection.map((i) => i.identifier));
    if (selectedIds.has('window')) {
      this.settings_config.window = parsed.window;
    }
    if (selectedIds.has('graphics_api')) {
      this.settings_config.graphics_api = parsed.graphics_api;
    }
    if (selectedIds.has('max_mem')) {
      this.max_mem = parsed.max_mem;
    }
    if (parsed.refresh_rate !== undefined && selectedIds.has('refresh_rate')) {
      this.refresh_rate = parsed.refresh_rate;
    }
    if (
      parsed.res_width !== undefined
      && parsed.res_height !== undefined
      && selectedIds.has('forced_resolution')
    ) {
      this.res_width = parsed.res_width;
      this.res_height = parsed.res_height;
    }
    if (parsed.view_distance_scale !== undefined && selectedIds.has('view_distance_scale')) {
      this.view_distance_scale = parsed.view_distance_scale;
    }
  },

  async start_load_pubg_launch_options_data(this: PubgStoreThis): Promise<boolean> {
    const steam_state = useSteamStore();
    const user_id = steam_state.active_steam_user?.id;
    if (!user_id) {
      console.warn('pubg: no steam user selected');
      this.options_selection = [];
      return false;
    }
    let default_mem_mb = 8192;
    try {
      default_mem_mb = normalizeTotalMemMb(Number(await systemTotalMemoryMb()));
    } catch {
      default_mem_mb = 8192;
    }
    const safe_max_mem_mb = calcSafeMaxMemMb(default_mem_mb);
    let start_launch_option = '';
    try {
      start_launch_option = await getPubgLaunchOption({id: Number(user_id)});
    } catch (err) {
      console.warn('pubg launch option load failed', err);
      useToast().error('toast.loadLaunchOptionError');
      return false;
    }
    this.parse_loaded_launch_string(start_launch_option, safe_max_mem_mb);

    // 同步 Movies 目录状态(用于“跳过开场动画”可恢复重命名方案)
    const disabled = await checkPubgSkipIntroMoviesDisabled().catch((err) => {
      console.warn('pubg skip_intro movies state check failed', err);
      return false;
    });
    this.skip_intro_movies_disabled = disabled;
    this.sync_skip_intro_selection_with_movies_disabled(disabled);
    return true;
  },
  sync_skip_intro_selection_with_movies_disabled(this: PubgStoreThis, _disabled: boolean) {
    const skipItem = PubgLaunchOptionsConfig.find(
      (raw) => isSteamLaunchOptionsImpl(raw) && raw.identifier === 'skip_intro',
    ) as SteamLaunchOptionsImpl | undefined;
    if (!skipItem) return;

    // "跳过开场动画" 是一次性目录重命名操作，不参与 Steam 启动项选择与拼接。
    const hadSkipSelected = this.options_selection.some((i) => i.identifier === skipItem.identifier);
    if (hadSkipSelected) {
      this.options_selection = this.options_selection.filter((i) => i.identifier !== skipItem.identifier);
    }
    // 清理“由 Steam 启动项解析得到的”覆盖参数，避免残留 skip_intro token。
    const key = String(skipItem.identifier ?? skipItem.name);
    if (key in this.parameter_overrides) {
      delete (this.parameter_overrides as Record<string, string[]>)[key];
    }
  },
  async set_skip_intro_movies_disabled(this: PubgStoreThis, disabled: boolean) {
    if (this.is_skip_intro_movies_loading) return;
    this.is_skip_intro_movies_loading = true;
    try {
      await setPubgSkipIntroMoviesDisabled({disabled});
      this.skip_intro_movies_disabled = disabled;
      this.sync_skip_intro_selection_with_movies_disabled(disabled);
    } finally {
      this.is_skip_intro_movies_loading = false;
    }
  },
  set_max_mem_from_display(this: PubgStoreThis, value: number) {
    const baseValueMb = this.max_mem_unit === 'gb' ? value * 1024 : value;
    this.max_mem = clampMaxMemMb(baseValueMb, this.max_mem_safe_limit_mb);
  },
};
