import PubgLaunchOptionsConfig from '@/data/pubg_launch_options_config.ts';
import {isSteamLaunchOptionsImpl, type SteamLaunchOptionsImpl} from '@/types/steam.ts';
import {
  clampMaxMemMb,
  clampViewDistance,
  matchFloat,
  matchInt,
  optionKey,
  tokensForCombinationParameters,
  tokensForGraphicsSub,
} from './helpers.ts';

export type PubgParsedLaunchOptions = {
  selection: SteamLaunchOptionsImpl[];
  parameter_overrides: Record<string, string[]>;
  window: string;
  graphics_api: string;
  max_mem: number;
  refresh_rate?: number;
  res_width?: number;
  res_height?: number;
  view_distance_scale?: number;
};

export function parsePubgLaunchOptionsString(
  start_launch_option: string,
  safe_max_mem_mb: number,
): PubgParsedLaunchOptions {
  const selection: SteamLaunchOptionsImpl[] = [];
  const parameter_overrides: Record<string, string[]> = {};
  let window = '-fullscreen';
  let graphics_api = 'dx11';
  let max_mem = clampMaxMemMb(safe_max_mem_mb, safe_max_mem_mb);
  let refresh_rate: number | undefined;
  let res_width: number | undefined;
  let res_height: number | undefined;
  let view_distance_scale: number | undefined;

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
        graphics_api = mode;
        selection.push(item);
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
        window = matchedToken;
        selection.push(item);
      }
      continue;
    }
    if (item.identifier === 'max_mem' || item.parameter === '-maxMem=X') {
      const v = matchInt(/-maxMem=(\d+)/i, start_launch_option);
      if (v !== null) {
        max_mem = clampMaxMemMb(v, safe_max_mem_mb);
        selection.push(item);
      }
      continue;
    }
    if (item.identifier === 'refresh_rate' || item.parameter === '-refresh X') {
      const v = matchInt(/-refresh\s+(\d+)/i, start_launch_option);
      if (v !== null) {
        refresh_rate = v;
        selection.push(item);
      }
      continue;
    }
    if (item.identifier === 'forced_resolution' || item.parameter === '-ResX=W -ResY=H') {
      const x = matchInt(/-resx=(\d+)/i, start_launch_option);
      const y = matchInt(/-resy=(\d+)/i, start_launch_option);
      if (x !== null && y !== null) {
        res_width = x;
        res_height = y;
        selection.push(item);
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
        view_distance_scale = clampViewDistance(v);
        selection.push(item);
      }
      continue;
    }
    if (item.is_combination_parameters && item.parameters) {
      const tokens = tokensForCombinationParameters(item);
      if (tokens.some((tok) => start_launch_option.includes(tok))) {
        selection.push(item);
      }
      continue;
    }
    if (typeof item.parameter === 'string') {
      if (start_launch_option.includes(item.parameter)) selection.push(item);
      continue;
    }
    if (Array.isArray(item.parameter)) {
      const matched = item.parameter.filter((tok) => start_launch_option.includes(tok));
      if (matched.length > 0) {
        const key = optionKey(item);
        parameter_overrides[key] = matched;
        selection.push(item);
      }
      continue;
    }
  }

  return {
    selection,
    parameter_overrides,
    window,
    graphics_api,
    max_mem,
    refresh_rate,
    res_width,
    res_height,
    view_distance_scale,
  };
}

export type PubgLaunchBuildInput = {
  options_selection: SteamLaunchOptionsImpl[];
  settings_config: { [key: string]: string | unknown };
  parameter_overrides: { [key: string]: string[] };
  max_mem: number;
  max_mem_safe_limit_mb: number;
  refresh_rate: number;
  res_width: number;
  res_height: number;
  view_distance_scale: number;
};

export function buildPubgLaunchOptionsString(input: PubgLaunchBuildInput): string {
  const items: string[] = [];
  for (const item of input.options_selection) {
    if (item.identifier === 'skip_intro') continue;
    if (item.identifier === 'max_mem' || item.parameter === '-maxMem=X') {
      const safeMemMb = clampMaxMemMb(input.max_mem, input.max_mem_safe_limit_mb);
      items.push(`-maxMem=${safeMemMb}`);
      continue;
    }
    if (item.identifier === 'refresh_rate' || item.parameter === '-refresh X') {
      items.push(`-refresh ${input.refresh_rate}`);
      continue;
    }
    if (item.identifier === 'forced_resolution' || item.parameter === '-ResX=W -ResY=H') {
      items.push(`-ResX=${input.res_width} -ResY=${input.res_height}`);
      continue;
    }
    if (
      item.identifier === 'view_distance_scale' ||
      item.parameter === '+r.ViewDistanceScale=X'
    ) {
      items.push(
        `+r.ViewDistanceScale=${clampViewDistance(Number(input.view_distance_scale))}`,
      );
      continue;
    }
    if (item.is_combination_parameters && item.parameters) {
      items.push(...tokensForCombinationParameters(item));
      continue;
    }
    if (item.identifier === 'window') {
      const token = String(input.settings_config.window || '');
      if (token) items.push(token);
      continue;
    }
    if (item.identifier === 'graphics_api' && item.parameters) {
      const mode = String(input.settings_config.graphics_api || 'dx11');
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
      const override = input.parameter_overrides[key];
      if (override && override.length > 0) items.push(...override);
      else if (typeof item.default_parameter === 'string') items.push(item.default_parameter);
      else if (item.parameter.length > 0) items.push(item.parameter[0]);
      continue;
    }
  }
  return items.join(' ');
}
