import {defineStore} from 'pinia';
import {invoke} from '@tauri-apps/api/core';
import PubgLaunchOptionsConfig from '@/data/pubg_launch_options_config.ts';
import {isSteamLaunchOptionsImpl, SteamLaunchOptionsImpl} from '@/data/steam.ts';
import steamStore from '@/stores/game/steam.ts';
import {Component, markRaw} from 'vue';

function optionKey(item: SteamLaunchOptionsImpl): string {
  return item.identifier ?? item.name;
}

function matchInt(re: RegExp, input: string): number | null {
  const m = input.match(re);
  if (!m?.[1]) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

function matchFloat(re: RegExp, input: string): number | null {
  const m = input.match(re);
  if (!m?.[1]) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

function clampViewDistance(v: number): number {
  return Math.min(1, Math.max(0.5, v));
}

function normalizeTotalMemMb(totalMemMb: number): number {
  if (!Number.isFinite(totalMemMb) || totalMemMb < 512) return 8192;
  return Math.floor(totalMemMb);
}

function calcSafeMaxMemMb(totalMemMb: number): number {
  return Math.max(512, Math.floor(totalMemMb) - 1024);
}

function clampMaxMemMb(valueMb: number, safeLimitMb: number): number {
  if (!Number.isFinite(valueMb)) return 512;
  const minMb = 512;
  const maxMb = Math.max(minMb, Math.floor(safeLimitMb));
  return Math.min(maxMb, Math.max(minMb, Math.floor(valueMb)));
}

function tokensForGraphicsSub(sub: SteamLaunchOptionsImpl): string[] {
  const par = sub.parameter;
  if (Array.isArray(par)) return par.filter((t): t is string => typeof t === 'string');
  if (typeof par === 'string') return [par];
  return [];
}

function tokensForCombinationParameters(item: SteamLaunchOptionsImpl): string[] {
  if (!item.parameters) return [];
  return item.parameters
    .map((sub) => sub.parameter)
    .filter((t): t is string => typeof t === 'string' && t.length > 0);
}

const pubgStore = defineStore('pubg', {
  state: () => ({
    is_start_loading: false,
    options_selection: <SteamLaunchOptionsImpl[]>[],
    // 通过“重命名 Content/Movies 目录”来禁用/恢复 PUBG 开场动画。
    skip_intro_movies_disabled: false,
    is_skip_intro_movies_loading: false,
    settings_config: <{ [key: string]: string | any }>({
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
    tip_view: <Component | null | undefined>null,
    tip_dialog: false,
  }),
  actions: {
    closeTip() {
      this.tip_dialog = false;
    },
    showTip(item: SteamLaunchOptionsImpl) {
      if (item.tip !== null && item.tip !== undefined) {
        this.tip_view = markRaw(item.tip);
        this.tip_dialog = true;
      }
    },
    start_launch() {
      this.is_start_loading = true;
      this.options_selection = [];
      this.skip_intro_movies_disabled = false;
      this.is_skip_intro_movies_loading = false;
      this.parameter_overrides = {};
      this.settings_config.window = '-fullscreen';
      this.settings_config.graphics_api = 'dx11';
      setTimeout(async () => {
        await this.start_load_pubg_launch_options_data();
        this.is_start_loading = false;
        this.original_launch_options = this.launch_options;
      }, 300);
    },
    async start_load_pubg_launch_options_data() {
      const steam_state = steamStore();
      const user_id = steam_state.active_steam_user?.id;
      if (!user_id) {
        console.warn('pubg: no steam user selected');
        return;
      }
      let default_mem_mb = 8192;
      try {
        default_mem_mb = normalizeTotalMemMb(Number(await invoke<number>('system_total_memory_mb')));
      } catch {
        default_mem_mb = 8192;
      }
      const safe_max_mem_mb = calcSafeMaxMemMb(default_mem_mb);
      this.max_mem_safe_limit_mb = safe_max_mem_mb;
      this.max_mem = clampMaxMemMb(safe_max_mem_mb, safe_max_mem_mb);
      await invoke<string>('get_pubg_launch_option', {id: Number(user_id)})
        .then((start_launch_option) => {
          this.options_selection = [];
          this.parameter_overrides = {};
          this.max_mem = clampMaxMemMb(safe_max_mem_mb, safe_max_mem_mb);
          for (const item of PubgLaunchOptionsConfig) {
            if (!isSteamLaunchOptionsImpl(item)) continue;
            if (item.identifier === 'graphics_api' && item.parameters) {
              let mode: string | null = null;
              if (start_launch_option.includes('-d3d12')) mode = 'dx12';
              else if (start_launch_option.includes('-force-feature-level-11-0')) mode = 'dx11';
              else if (start_launch_option.includes('-sm4') || start_launch_option.includes('-d3d10')) {
                mode = 'dx10';
              }
              else if (start_launch_option.includes('-dx9')) {
                mode = 'dx9';
              }
              if (mode) {
                this.settings_config.graphics_api = mode;
                this.options_selection.push(item);
              }
              continue;
            }
            if (item.identifier === 'window' && item.parameters) {
              let matchedToken: string | null = null;
              for (const p of item.parameters) {
                const token =
                  typeof p.parameter === 'string'
                    ? p.parameter
                    : Array.isArray(p.parameter)
                      ? p.parameter[0]
                      : null;
                if (!token) continue;
                if (token === '-window') {
                  if (start_launch_option.includes('-windowed')) {
                    matchedToken = '-window';
                    break;
                  }
                  if (/(?:^|\s)-window(?:\s|$)/.test(start_launch_option)) {
                    matchedToken = '-window';
                    break;
                  }
                } else if (start_launch_option.includes(token)) {
                  matchedToken = token;
                  break;
                }
              }
              if (matchedToken) {
                this.settings_config.window = matchedToken;
                this.options_selection.push(item);
              }
              continue;
            }
            if (item.identifier === 'max_mem' || item.parameter === '-maxMem=X') {
              const v = matchInt(/-maxMem=(\d+)/i, start_launch_option);
              if (v !== null) {
                this.max_mem = clampMaxMemMb(v, this.max_mem_safe_limit_mb);
                this.options_selection.push(item);
              }
              continue;
            }
            if (item.identifier === 'refresh_rate' || item.parameter === '-refresh X') {
              const v = matchInt(/-refresh\s+(\d+)/i, start_launch_option);
              if (v !== null) {
                this.refresh_rate = v;
                this.options_selection.push(item);
              }
              continue;
            }
            if (item.identifier === 'forced_resolution' || item.parameter === '-ResX=W -ResY=H') {
              const x = matchInt(/-resx=(\d+)/i, start_launch_option);
              const y = matchInt(/-resy=(\d+)/i, start_launch_option);
              if (x !== null && y !== null) {
                this.res_width = x;
                this.res_height = y;
                this.options_selection.push(item);
              }
              continue;
            }
            if (
              item.identifier === 'view_distance_scale' ||
              item.parameter === '+r.ViewDistanceScale=X'
            ) {
              const v = matchFloat(
                /\+r\.ViewDistanceScale=([0-9]*\.?[0-9]+)/i,
                start_launch_option,
              );
              if (v !== null) {
                this.view_distance_scale = clampViewDistance(v);
                this.options_selection.push(item);
              }
              continue;
            }
            if (item.is_combination_parameters && item.parameters) {
              const tokens = tokensForCombinationParameters(item);
              if (tokens.some((tok) => start_launch_option.includes(tok))) {
                this.options_selection.push(item);
              }
              continue;
            }
            if (typeof item.parameter === 'string') {
              if (start_launch_option.includes(item.parameter)) this.options_selection.push(item);
              continue;
            }
            if (Array.isArray(item.parameter)) {
              const matched = item.parameter.filter((tok) => start_launch_option.includes(tok));
              if (matched.length > 0) {
                const key = optionKey(item);
                this.parameter_overrides[key] = matched;
                this.options_selection.push(item);
              }
              continue;
            }
          }
        })
        .catch((err) => {
          console.warn('pubg launch option load failed', err);
        });

      // 同步 Movies 目录状态（用于“跳过开场动画”可恢复重命名方案）
      const disabled = await invoke<boolean>('check_pubg_skip_intro_movies_disabled').catch((err) => {
        console.warn('pubg skip_intro movies state check failed', err);
        return false;
      });
      this.skip_intro_movies_disabled = disabled;
      this.sync_skip_intro_selection_with_movies_disabled(disabled);
    },
    sync_skip_intro_selection_with_movies_disabled(_disabled: boolean) {
      const skipItem = PubgLaunchOptionsConfig.find(
        (raw) => isSteamLaunchOptionsImpl(raw) && raw.identifier === 'skip_intro',
      ) as SteamLaunchOptionsImpl | undefined;
      if (!skipItem) return;

      // "跳过开场动画" 是一次性目录重命名操作，不参与 Steam 启动项选择与拼接。
      this.options_selection = this.options_selection.filter((i) => i.identifier !== skipItem.identifier);
      // 清理“由 Steam 启动项解析得到的”覆盖参数，避免残留 skip_intro token。
      const key = String(skipItem.identifier ?? skipItem.name);
      delete (this.parameter_overrides as Record<string, string[]>)[key];
    },
    async set_skip_intro_movies_disabled(disabled: boolean) {
      if (this.is_skip_intro_movies_loading) return;
      this.is_skip_intro_movies_loading = true;
      try {
        await invoke<void>('set_pubg_skip_intro_movies_disabled', {disabled});
        this.skip_intro_movies_disabled = disabled;
        this.sync_skip_intro_selection_with_movies_disabled(disabled);
      } finally {
        this.is_skip_intro_movies_loading = false;
      }
    },
    set_max_mem_from_display(value: number) {
      const baseValueMb = this.max_mem_unit === 'gb' ? value * 1024 : value;
      this.max_mem = clampMaxMemMb(baseValueMb, this.max_mem_safe_limit_mb);
    },
  },
  getters: {
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
      const items: string[] = [];
      for (const item of state.options_selection) {
        if (item.identifier === 'skip_intro') continue;
        if (item.identifier === 'max_mem' || item.parameter === '-maxMem=X') {
          const safeMemMb = clampMaxMemMb(state.max_mem, state.max_mem_safe_limit_mb);
          items.push(`-maxMem=${safeMemMb}`);
          continue;
        }
        if (item.identifier === 'refresh_rate' || item.parameter === '-refresh X') {
          items.push(`-refresh ${state.refresh_rate}`);
          continue;
        }
        if (item.identifier === 'forced_resolution' || item.parameter === '-ResX=W -ResY=H') {
          items.push(`-ResX=${state.res_width} -ResY=${state.res_height}`);
          continue;
        }
        if (
          item.identifier === 'view_distance_scale' ||
          item.parameter === '+r.ViewDistanceScale=X'
        ) {
          items.push(
            `+r.ViewDistanceScale=${clampViewDistance(Number(state.view_distance_scale))}`,
          );
          continue;
        }
        if (item.is_combination_parameters && item.parameters) {
          items.push(...tokensForCombinationParameters(item));
          continue;
        }
        if (item.identifier === 'window') {
          const token = String(state.settings_config.window || '');
          if (token) items.push(token);
          continue;
        }
        if (item.identifier === 'graphics_api' && item.parameters) {
          const mode = String(state.settings_config.graphics_api || 'dx11');
          const sub = item.parameters.find((p) => p.identifier === mode);
          if (sub) items.push(...tokensForGraphicsSub(sub));
          continue;
        }
        if (typeof item.parameter === 'string') {
          items.push(item.parameter);
          continue;
        }
        if (Array.isArray(item.parameter)) {
          const key = optionKey(item);
          const override = state.parameter_overrides[key];
          if (override && override.length > 0) items.push(...override);
          else if (typeof item.default_parameter === 'string') items.push(item.default_parameter);
          else if (item.parameter.length > 0) items.push(item.parameter[0]);
          continue;
        }
      }
      return items.join(' ');
    },
    is_launch_options_modified(state): boolean {
      return state.original_launch_options !== '' && this.launch_options !== state.original_launch_options;
    },
  },
});

export default pubgStore;
