import PubgLaunchOptionsConfig from '@/data/pubg_launch_options_config.ts';
import {isSteamLaunchOptionsImpl, type SteamLaunchOptionsImpl} from '@/types/steam.ts';
import {
  clampMaxMemMb,
  clampViewDistance,
} from '@/stores/game/pubg/helpers.ts';
import {tokenizeApexLaunchOptions} from '@/utils/game/apex_custom_launch_options.ts';

/**
 * PUBG and Apex both receive a whitespace-delimited Steam launch string. The
 * tokenizer is shared so a quoted custom argument cannot accidentally make a
 * catalog option look enabled (for example, `+exec "cfg/-high"`).
 */
type LaunchToken = ReturnType<typeof tokenizeApexLaunchOptions>[number];

export type PubgParsedLaunchOptions = {
  selection: SteamLaunchOptionsImpl[];
  parameter_overrides: Record<string, string[]>;
  /** Tokens not owned by the catalog, retained when the string is rebuilt. */
  custom_launch_options: string;
  window: string;
  graphics_api: string;
  max_mem: number;
  refresh_rate?: number;
  res_width?: number;
  res_height?: number;
  view_distance_scale?: number;
};

function parameterTokens(parameter: string): LaunchToken[] {
  return tokenizeApexLaunchOptions(parameter);
}

function commandTokenIsAvailable(
  token: LaunchToken | undefined,
  claimed: ReadonlySet<number>,
  protectedIndices: ReadonlySet<number>,
  index: number,
): boolean {
  return Boolean(
    token
      && token.closedQuote
      && !token.hasQuotes
      && !claimed.has(index)
      && !protectedIndices.has(index),
  );
}

function findSequence(
  tokens: readonly LaunchToken[],
  wanted: readonly LaunchToken[],
  claimed: ReadonlySet<number>,
  protectedIndices: ReadonlySet<number>,
): number[] | null {
  if (wanted.length === 0) return null;
  for (let start = 0; start <= tokens.length - wanted.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < wanted.length; offset += 1) {
      const index = start + offset;
      if (!commandTokenIsAvailable(tokens[index], claimed, protectedIndices, index)
        || tokens[index].value.toLowerCase() !== wanted[offset].value.toLowerCase()) {
        matched = false;
        break;
      }
    }
    if (matched) return Array.from({length: wanted.length}, (_, offset) => start + offset);
  }
  return null;
}

function claim(claimed: Set<number>, indices: readonly number[] | null): void {
  if (!indices) return;
  for (const index of indices) claimed.add(index);
}

function takeSequence(
  tokens: readonly LaunchToken[],
  parameter: string,
  claimed: Set<number>,
  protectedIndices: ReadonlySet<number>,
): number[] | null {
  const wanted = parameterTokens(parameter);
  const first = findSequence(tokens, wanted, claimed, protectedIndices);
  let match = first;
  while (match) {
    claim(claimed, match);
    match = findSequence(tokens, wanted, claimed, protectedIndices);
  }
  return first;
}

function findToken(
  tokens: readonly LaunchToken[],
  predicate: (value: string) => boolean,
  claimed: ReadonlySet<number>,
  protectedIndices: ReadonlySet<number>,
): number | null {
  for (let index = 0; index < tokens.length; index += 1) {
    if (!commandTokenIsAvailable(tokens[index], claimed, protectedIndices, index)) continue;
    if (predicate(tokens[index].value)) return index;
  }
  return null;
}

function protectExecArguments(tokens: readonly LaunchToken[]): Set<number> {
  const protectedIndices = new Set<number>();
  for (let index = 0; index + 1 < tokens.length; index += 1) {
    if (tokens[index].value.toLowerCase() === '+exec') protectedIndices.add(index + 1);
  }
  return protectedIndices;
}

function normalizeWhitespaceOutsideQuotes(value: string): string {
  let output = '';
  let quote: '"' | "'" | null = null;
  let pendingSpace = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      output += character;
      if (character === quote && value[index - 1] !== '\\') quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      if (pendingSpace && output.length > 0) output += ' ';
      pendingSpace = false;
      quote = character;
      output += character;
      continue;
    }
    if (/\s/.test(character)) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && output.length > 0) output += ' ';
    pendingSpace = false;
    output += character;
  }
  return output.trim();
}

function renderCustomOptions(
  source: string,
  tokens: readonly LaunchToken[],
  claimed: ReadonlySet<number>,
): string {
  const ranges = [...claimed]
    .sort((left, right) => left - right)
    .map(index => ({start: tokens[index].start, end: tokens[index].end}));
  let output = '';
  let cursor = 0;
  for (const range of ranges) {
    output += source.slice(cursor, range.start);
    cursor = range.end;
  }
  output += source.slice(cursor);
  return normalizeWhitespaceOutsideQuotes(output);
}

function numericToken(value: string): boolean {
  return /^\d+$/.test(value) && Number.isFinite(Number(value));
}

function takeDynamicValue(
  tokens: readonly LaunchToken[],
  predicate: (value: string) => boolean,
  claimed: Set<number>,
  protectedIndices: ReadonlySet<number>,
): string | undefined {
  const index = findToken(tokens, predicate, claimed, protectedIndices);
  if (index === null) return undefined;
  const value = tokens[index].value;
  const number = Number(value.slice(value.indexOf('=') + 1));
  for (let candidate = index; candidate < tokens.length; candidate += 1) {
    if (!commandTokenIsAvailable(tokens[candidate], claimed, protectedIndices, candidate)) continue;
    const next = tokens[candidate].value;
    if (predicate(next) && Number(next.slice(next.indexOf('=') + 1)) === number) {
      claimed.add(candidate);
    }
  }
  return value;
}

function takeValueAfterCommand(
  tokens: readonly LaunchToken[],
  command: string,
  claimed: Set<number>,
  protectedIndices: ReadonlySet<number>,
): string | undefined {
  let selected: string | undefined;
  for (let index = 0; index + 1 < tokens.length; index += 1) {
    if (!commandTokenIsAvailable(tokens[index], claimed, protectedIndices, index)
      || tokens[index].value.toLowerCase() !== command.toLowerCase()) continue;
    if (!commandTokenIsAvailable(tokens[index + 1], claimed, protectedIndices, index + 1)) continue;
    if (!numericToken(tokens[index + 1].value)) continue;
    if (selected !== undefined && Number(tokens[index + 1].value) !== Number(selected)) continue;
    selected ??= tokens[index + 1].value;
    claimed.add(index);
    claimed.add(index + 1);
  }
  return selected;
}

function graphicsParameterTokens(item: SteamLaunchOptionsImpl, mode: string): string[] {
  const sub = item.parameters?.find(parameter => parameter.identifier === mode);
  if (!sub) return [];
  if (typeof sub.parameter === 'string') return [sub.parameter];
  return Array.isArray(sub.parameter) ? sub.parameter : [];
}

function takeGraphicsApi(
  item: SteamLaunchOptionsImpl,
  tokens: readonly LaunchToken[],
  claimed: Set<number>,
  protectedIndices: ReadonlySet<number>,
): string | undefined {
  const modes = ['dx12', 'dx11', 'dx10', 'dx9'];
  const matches = new Map<string, number[]>();
  for (const mode of modes) {
    for (const parameter of graphicsParameterTokens(item, mode)) {
      // Claim duplicates together, but never choose a winner across backends.
      const pending = new Set(claimed);
      let match = findSequence(tokens, parameterTokens(parameter), pending, protectedIndices);
      while (match) {
        matches.set(mode, [...(matches.get(mode) ?? []), ...match]);
        claim(pending, match);
        match = findSequence(tokens, parameterTokens(parameter), pending, protectedIndices);
      }
    }
  }
  if (matches.size !== 1) return undefined;
  const [mode, indices] = [...matches][0];
  claim(claimed, indices);
  return mode;
}

function takeWindow(
  item: SteamLaunchOptionsImpl,
  tokens: readonly LaunchToken[],
  claimed: Set<number>,
  protectedIndices: ReadonlySet<number>,
): string | undefined {
  const aliases: Array<{canonical: string; values: string[]}> = [
    {canonical: '-fullscreen', values: ['-fullscreen']},
    {canonical: '-windowed', values: ['-windowed']},
    {canonical: '-noborder', values: ['-noborder']},
  ];
  let selected: string | undefined;
  const pending = new Set(claimed);
  for (const alias of aliases) {
    for (const value of alias.values) {
      let match = findSequence(tokens, parameterTokens(value), pending, protectedIndices);
      while (match) {
        if (selected && selected !== alias.canonical) return undefined;
        selected = alias.canonical;
        claim(pending, match);
        match = findSequence(tokens, parameterTokens(value), pending, protectedIndices);
      }
    }
  }
  // Keep the argument driven by the catalog. This also makes malformed future
  // window entries fail closed instead of matching arbitrary substrings.
  if (!item.parameters || !selected) return undefined;
  claim(claimed, [...pending]);
  return selected;
}

export function parsePubgLaunchOptionsString(
  start_launch_option: string,
  safe_max_mem_mb: number,
): PubgParsedLaunchOptions {
  const tokens = tokenizeApexLaunchOptions(start_launch_option);
  const claimed = new Set<number>();
  const protectedIndices = protectExecArguments(tokens);
  const selection: SteamLaunchOptionsImpl[] = [];
  const parameter_overrides: Record<string, string[]> = {};
  let window = '-fullscreen';
  let graphics_api = 'dx11';
  let max_mem = clampMaxMemMb(safe_max_mem_mb, safe_max_mem_mb);
  let refresh_rate: number | undefined;
  let res_width: number | undefined;
  let res_height: number | undefined;
  let view_distance_scale: number | undefined;

  for (const raw of PubgLaunchOptionsConfig) {
    if (!isSteamLaunchOptionsImpl(raw)) continue;
    const item = raw;
    // Movies-folder handling is independent of any pre-existing launch flags.
    if (item.identifier === 'skip_intro') continue;

    if (item.identifier === 'graphics_api' && item.parameters) {
      const mode = takeGraphicsApi(item, tokens, claimed, protectedIndices);
      if (mode) {
        graphics_api = mode;
        selection.push(item);
      }
      continue;
    }
    if (item.identifier === 'window' && item.parameters) {
      const mode = takeWindow(item, tokens, claimed, protectedIndices);
      if (mode) {
        window = mode;
        selection.push(item);
      }
      continue;
    }
    if (item.identifier === 'max_mem' || item.parameter === '-maxMem=X') {
      const value = takeDynamicValue(tokens, candidate => /^-maxMem=\d+$/i.test(candidate), claimed, protectedIndices);
      if (value !== undefined) {
        max_mem = clampMaxMemMb(Number(value.slice(value.indexOf('=') + 1)), safe_max_mem_mb);
        selection.push(item);
      }
      continue;
    }
    if (item.identifier === 'refresh_rate' || item.parameter === '-refresh X') {
      const value = takeValueAfterCommand(tokens, '-refresh', claimed, protectedIndices);
      if (value !== undefined) {
        refresh_rate = Number(value);
        selection.push(item);
      }
      continue;
    }
    if (item.identifier === 'forced_resolution' || item.parameter === '-ResX=W -ResY=H') {
      const pending = new Set(claimed);
      const width = takeDynamicValue(tokens, candidate => /^-ResX=\d+$/i.test(candidate), pending, protectedIndices);
      const height = takeDynamicValue(tokens, candidate => /^-ResY=\d+$/i.test(candidate), pending, protectedIndices);
      if (width !== undefined && height !== undefined) {
        claim(claimed, [...pending]);
        res_width = Number(width.slice(width.indexOf('=') + 1));
        res_height = Number(height.slice(height.indexOf('=') + 1));
        selection.push(item);
      }
      continue;
    }
    if (item.identifier === 'view_distance_scale' || item.parameter === '+r.ViewDistanceScale=X') {
      const value = takeDynamicValue(
        tokens,
        candidate => /^\+r\.ViewDistanceScale=[0-9]*\.?[0-9]+$/i.test(candidate),
        claimed,
        protectedIndices,
      );
      if (value !== undefined) {
        view_distance_scale = clampViewDistance(Number(value.slice(value.indexOf('=') + 1)));
        selection.push(item);
      }
      continue;
    }
    if (item.is_combination_parameters && item.parameters) {
      const pending = new Set(claimed);
      const complete = item.parameters.length > 0 && item.parameters.every(parameter =>
        typeof parameter.parameter === 'string'
        && takeSequence(tokens, parameter.parameter, pending, protectedIndices) !== null,
      );
      if (complete) {
        claim(claimed, [...pending]);
        selection.push(item);
      }
      continue;
    }
    if (typeof item.parameter === 'string') {
      if (takeSequence(tokens, item.parameter, claimed, protectedIndices)) selection.push(item);
      continue;
    }
    if (Array.isArray(item.parameter)) {
      const matched: string[] = [];
      for (const parameter of item.parameter) {
        const match = takeSequence(tokens, parameter, claimed, protectedIndices);
        if (match) matched.push(match.map(index => tokens[index].raw).join(' '));
      }
      if (matched.length > 0) {
        parameter_overrides[item.identifier ?? item.name] = matched;
        selection.push(item);
      }
    }
  }

  return {
    selection,
    parameter_overrides,
    custom_launch_options: renderCustomOptions(start_launch_option, tokens, claimed),
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
  settings_config: {[key: string]: string | unknown};
  parameter_overrides: {[key: string]: string[]};
  custom_launch_options?: string;
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
    if (item.identifier === 'view_distance_scale' || item.parameter === '+r.ViewDistanceScale=X') {
      items.push(`+r.ViewDistanceScale=${clampViewDistance(Number(input.view_distance_scale))}`);
      continue;
    }
    if (item.is_combination_parameters && item.parameters) {
      items.push(...item.parameters
        .map(parameter => parameter.parameter)
        .filter((value): value is string => typeof value === 'string' && value.length > 0));
      continue;
    }
    if (item.identifier === 'window') {
      const token = String(input.settings_config.window || '');
      if (token) items.push(token);
      continue;
    }
    if (item.identifier === 'graphics_api' && item.parameters) {
      const mode = String(input.settings_config.graphics_api || 'dx11');
      const sub = item.parameters.find(parameter => parameter.identifier === mode);
      if (!sub) continue;
      const parameter = sub.default_parameter
        ?? (typeof sub.parameter === 'string' ? sub.parameter : sub.parameter?.[0]);
      if (parameter) items.push(parameter);
      continue;
    }
    if (typeof item.parameter === 'string') {
      items.push(item.parameter);
      continue;
    }
    if (Array.isArray(item.parameter)) {
      const key = item.identifier ?? item.name;
      const override = input.parameter_overrides[key];
      if (override && override.length > 0) items.push(...override);
      else if (typeof item.default_parameter === 'string') items.push(item.default_parameter);
      else if (item.parameter.length > 0) items.push(item.parameter[0]);
    }
  }
  const custom = input.custom_launch_options?.trim();
  if (custom) items.push(custom);
  return items.join(' ');
}
