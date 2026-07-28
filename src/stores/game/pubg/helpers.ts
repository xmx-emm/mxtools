import type {SteamLaunchOptionsImpl} from '@/types/steam.ts';

export function optionKey(item: SteamLaunchOptionsImpl): string {
  return item.identifier ?? item.name;
}

export function matchInt(re: RegExp, input: string): number | null {
  const m = input.match(re);
  if (!m?.[1]) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

export function matchFloat(re: RegExp, input: string): number | null {
  const m = input.match(re);
  if (!m?.[1]) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

export function clampViewDistance(v: number): number {
  return Math.min(1, Math.max(0.5, v));
}

export function normalizeTotalMemMb(totalMemMb: number): number {
  if (!Number.isFinite(totalMemMb) || totalMemMb < 512) return 8192;
  return Math.floor(totalMemMb);
}

export function calcSafeMaxMemMb(totalMemMb: number): number {
  return Math.max(512, Math.floor(totalMemMb) - 1024);
}

export function clampMaxMemMb(valueMb: number, safeLimitMb: number): number {
  if (!Number.isFinite(valueMb)) return 512;
  const minMb = 512;
  const maxMb = Math.max(minMb, Math.floor(safeLimitMb));
  return Math.min(maxMb, Math.max(minMb, Math.floor(valueMb)));
}

export function tokensForGraphicsSub(sub: SteamLaunchOptionsImpl): string[] {
  const par = sub.parameter;
  if (Array.isArray(par)) return par.filter((t): t is string => typeof t === 'string');
  if (typeof par === 'string') return [par];
  return [];
}

export function tokensForCombinationParameters(item: SteamLaunchOptionsImpl): string[] {
  if (!item.parameters) return [];
  return item.parameters
    .map((sub) => sub.parameter)
    .filter((t): t is string => typeof t === 'string' && t.length > 0);
}
