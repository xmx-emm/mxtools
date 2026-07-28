import ApexLaunchOptionsConfig from '@/data/apex_launch_options_config.ts';
import {isSteamLaunchOptionsImpl, type SteamLaunchOptionsImpl} from '@/types/steam.ts';
import type {ApexLauncherAccount} from '@/types/apex.ts';
import {useEaStore} from '@/stores/game/ea.ts';
import {useSteamStore} from '@/stores/game/steam.ts';

/** 数值容差比较：避免 '0.6' 与 '0.600000' 字符串不等 */
export function videoConfigValueEquals(a: string, b: string): boolean {
  if (a === b) return true;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    return Math.abs(na - nb) < 1e-6;
  }
  return false;
}

export function launcherAccountKey(acc: ApexLauncherAccount): string {
  return `${acc.kind}:${acc.user.id}`;
}

export const MILES_LANGUAGE_CHECK_CACHE_MS = import.meta.env.DEV ? 120000 : 60000;

export function milesLanguageCheckKey(
  acc: ApexLauncherAccount | null,
  language: string,
  milesEnabled: boolean,
): string | null {
  if (!acc || !milesEnabled) return null;
  return `${acc.kind}:${acc.user.id}:${language}`;
}

export function findApexAccountByKey(
  accounts: ApexLauncherAccount[],
  key: string | null,
): ApexLauncherAccount | null {
  if (!key) return null;
  const idx = key.indexOf(':');
  if (idx <= 0) return null;
  const kind = key.slice(0, idx) as 'steam' | 'ea';
  const id = key.slice(idx + 1);
  if (kind !== 'steam' && kind !== 'ea') return null;
  return accounts.find((a) => a.kind === kind && a.user.id === id) ?? null;
}

/** 恢复 Apex 选中账户：优先持久化的 launcher_selection_key，其次 EA/Steam 各自 store 中的 active user */
export function resolveActiveApexAccount(
  accounts: ApexLauncherAccount[],
  launcherKey: string | null,
): ApexLauncherAccount | null {
  const fromKey = findApexAccountByKey(accounts, launcherKey);
  if (fromKey) return fromKey;
  if (accounts.length === 0) return null;

  const steam = useSteamStore();
  const ea = useEaStore();
  const fromEa = findApexAccountByKey(accounts, ea.active_ea_user ? `ea:${ea.active_ea_user.id}` : null);
  if (fromEa) return fromEa;
  const fromSteam = findApexAccountByKey(
    accounts,
    steam.active_steam_user ? `steam:${steam.active_steam_user.id}` : null,
  );
  if (fromSteam) return fromSteam;
  return accounts.find((a) => a.kind === 'steam') ?? accounts[0];
}

export function videoConfigDisplayKey(identifier: string): string {
  return identifier.replace(/^setting\./, '');
}

export function normalizeVideoConfigMap(raw: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    normalized[key.replace(/^"+|"+$/g, '')] = value;
  }
  return normalized;
}

export function findLaunchOptionByIdentifier(identifier: string): SteamLaunchOptionsImpl | undefined {
  for (const row of ApexLaunchOptionsConfig) {
    if (isSteamLaunchOptionsImpl(row) && row.identifier === identifier) {
      return row;
    }
  }
  return undefined;
}

export function ensureOptionInSelection(
  selection: SteamLaunchOptionsImpl[],
  identifier: string,
): void {
  const option = findLaunchOptionByIdentifier(identifier);
  if (!option) return;
  if (!selection.some((item) => item.identifier === identifier)) {
    selection.push(option);
  }
}

export function removeOptionFromSelection(
  selection: SteamLaunchOptionsImpl[],
  identifier: string,
): void {
  const idx = selection.findIndex((item) => item.identifier === identifier);
  if (idx >= 0) selection.splice(idx, 1);
}
