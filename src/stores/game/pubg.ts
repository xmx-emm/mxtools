import {defineStore} from 'pinia';
import {invoke} from '@tauri-apps/api/core';
import PubgLaunchOptionsConfig from '@/data/pubg_launch_options_config.ts';
import {isSteamLaunchOptionsImpl, SteamLaunchOptionsImpl} from '@/data/steam.ts';
import steamStore from '@/stores/game/steam.ts';

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

function tokensForGraphicsSub(sub: SteamLaunchOptionsImpl): string[] {
  const par = sub.parameter;
  if (Array.isArray(par)) return par.filter((t): t is string => typeof t === 'string');
  if (typeof par === 'string') return [par];
  return [];
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
    max_mem: 0,
    refresh_rate: 144,
    res_width: 1920,
    res_height: 1080,
    view_distance_scale: 0.8,
    parameter_overrides: <{ [key: string]: string[] }>{},
    original_launch_options: '',
  }),
  actions: {
    closeTip() {},
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
        default_mem_mb = Number(await invoke<number>('system_total_memory_mb'));
        if (!Number.isFinite(default_mem_mb) || default_mem_mb < 512) default_mem_mb = 8192;
      } catch {
        default_mem_mb = 8192;
      }
      this.max_mem = default_mem_mb;
      await invoke<string>('get_pubg_launch_option', {id: Number(user_id)})
        .then((start_launch_option) => {
          this.options_selection = [];
          this.parameter_overrides = {};
          this.max_mem = default_mem_mb;
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
                this.max_mem = v;
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
            if (item.identifier === 'forced_resolution' || item.parameter === '-res W H') {
              const m = start_launch_option.match(/-res\s+(\d+)\s+(\d+)/i);
              if (m?.[1] && m?.[2]) {
                this.res_width = Number(m[1]);
                this.res_height = Number(m[2]);
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
    sync_skip_intro_selection_with_movies_disabled(disabled: boolean) {
      const skipItem = PubgLaunchOptionsConfig.find(
        (raw) => isSteamLaunchOptionsImpl(raw) && raw.identifier === 'skip_intro',
      ) as SteamLaunchOptionsImpl | undefined;
      if (!skipItem) return;

      if (disabled) {
        if (!this.options_selection.some((i) => i.identifier === skipItem.identifier)) {
          this.options_selection.push(skipItem);
        }
      } else {
        this.options_selection = this.options_selection.filter((i) => i.identifier !== skipItem.identifier);
        // 清理“由 Steam 启动项解析得到的”覆盖参数，避免恢复后仍带上 skip_intro token。
        const key = String(skipItem.identifier ?? skipItem.name);
        delete (this.parameter_overrides as Record<string, string[]>)[key];
      }
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
  },
  getters: {
    launch_options(state) {
      const items: string[] = [];
      for (const item of state.options_selection) {
        if (item.identifier === 'max_mem' || item.parameter === '-maxMem=X') {
          items.push(`-maxMem=${state.max_mem}`);
          continue;
        }
        if (item.identifier === 'refresh_rate' || item.parameter === '-refresh X') {
          items.push(`-refresh ${state.refresh_rate}`);
          continue;
        }
        if (item.identifier === 'forced_resolution' || item.parameter === '-res W H') {
          items.push(`-res ${state.res_width} ${state.res_height}`);
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
      return items.sort().join(' ');
    },
    is_launch_options_modified(state): boolean {
      return state.original_launch_options !== '' && this.launch_options !== state.original_launch_options;
    },
  },
});

export default pubgStore;
