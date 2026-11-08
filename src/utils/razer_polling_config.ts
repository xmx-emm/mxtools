import type {
  RazerBackgroundConfig,
  RazerBackgroundGame,
  RazerBackgroundGameMatcher,
} from '@/types/background_runtime.ts';
import type {InstalledGame} from '@/types/game_scan.ts';
import type {
  RazerPollingDevice,
  RazerPollingStatus,
} from '@/types/razer_polling.ts';

// Exact USB model verified on the development machine, including restoration.
// Do not generalize these rates to other receivers or wired product IDs.
export const BUILTIN_RAZER_MODEL_PRESETS: Readonly<Record<string, readonly number[]>> = {
  '1532:00e6': [125, 250, 500, 1000, 2000, 4000, 8000],
};

function normalizedRates(rates: readonly number[]): number[] {
  return [...new Set(rates)].sort((left, right) => left - right);
}

function ratesEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((rate, index) => rate === right[index]);
}

function lastRate(rates: readonly number[]): number | undefined {
  return rates[rates.length - 1];
}

export function razerModelKey(
  device: Pick<RazerPollingDevice, 'vendorId' | 'productId'>,
): string {
  const vendorId = device.vendorId.toString(16).padStart(4, '0');
  const productId = device.productId.toString(16).padStart(4, '0');
  return `${vendorId}:${productId}`;
}

export function connectedRazerStatuses(statuses: readonly RazerPollingStatus[]) {
  return statuses.filter(status => status.available);
}

export function confirmedRates(status: RazerPollingStatus): number[] {
  const rates = new Set(status.supportedRatesHz);
  if (status.currentRateHz != null) rates.add(status.currentRateHz);
  return [...rates].sort((left, right) => left - right);
}

export function verifiedRatesForStatus(
  config: RazerBackgroundConfig,
  status: RazerPollingStatus,
): number[] {
  const profileRates = config.deviceProfiles[status.device.deviceId]?.verifiedRatesHz ?? [];
  const modelRates = config.modelPresets?.[razerModelKey(status.device)]
    ?? BUILTIN_RAZER_MODEL_PRESETS[razerModelKey(status.device)] ?? [];
  return normalizedRates([...profileRates, ...modelRates, ...confirmedRates(status)]);
}

export function hasModelPreset(
  config: RazerBackgroundConfig,
  status: RazerPollingStatus,
): boolean {
  return Boolean((config.modelPresets?.[razerModelKey(status.device)]
    ?? BUILTIN_RAZER_MODEL_PRESETS[razerModelKey(status.device)])?.length);
}

export function recordVerifiedModelPreset(
  config: RazerBackgroundConfig,
  status: RazerPollingStatus,
  supportedRatesHz: readonly number[],
): boolean {
  const rates = normalizedRates(supportedRatesHz);
  if (!rates.length || status.currentRateHz == null) return false;

  config.modelPresets ??= {};
  config.modelPresets[razerModelKey(status.device)] = rates;
  const deviceId = status.device.deviceId;
  const existing = config.deviceProfiles[deviceId];
  config.deviceProfiles[deviceId] = {
    ...existing,
    idleRateHz: supportedIdleRate(existing?.idleRateHz, status.currentRateHz, rates),
    verifiedRatesHz: rates,
  };
  return true;
}

// The idle rate must stay inside the verified set; otherwise the background
// worker would restore idle to a rate the device never confirmed.
function supportedIdleRate(
  previous: number | undefined,
  current: number,
  rates: readonly number[],
): number {
  if (previous != null && rates.includes(previous)) return previous;
  if (rates.includes(current)) return current;
  return rates.reduce((nearest, rate) =>
    Math.abs(rate - current) < Math.abs(nearest - current) ? rate : nearest);
}

export function highestConfirmedRate(status: RazerPollingStatus): number | null {
  const rates = confirmedRates(status);
  return rates[rates.length - 1] ?? null;
}

export function syncConnectedDeviceProfiles(
  config: RazerBackgroundConfig,
  statuses: readonly RazerPollingStatus[],
): boolean {
  let changed = false;
  for (const status of connectedRazerStatuses(statuses)) {
    const deviceId = status.device.deviceId;
    const existing = config.deviceProfiles[deviceId];
    const rates = verifiedRatesForStatus(config, status);
    if (!existing && status.currentRateHz == null) continue;
    const next = {
      ...existing,
      idleRateHz: existing?.idleRateHz ?? status.currentRateHz!,
      verifiedRatesHz: rates,
    };
    if (existing
      && existing.idleRateHz === next.idleRateHz
      && ratesEqual(existing.verifiedRatesHz, next.verifiedRatesHz)) continue;
    config.deviceProfiles[deviceId] = next;
    changed = true;
  }
  return backfillGameDeviceRates(config, statuses) || changed;
}

// A device connected after games were added gets its verified maximum for
// each game; rates the user already chose for other devices stay untouched.
export function backfillGameDeviceRates(
  config: RazerBackgroundConfig,
  statuses: readonly RazerPollingStatus[],
): boolean {
  let changed = false;
  for (const status of connectedRazerStatuses(statuses)) {
    const rate = lastRate(verifiedRatesForStatus(config, status));
    if (rate == null) continue;
    for (const game of config.games) {
      if (game.deviceRatesHz[status.device.deviceId] != null) continue;
      game.deviceRatesHz[status.device.deviceId] = rate;
      changed = true;
    }
  }
  return changed;
}

export function scannedGameMatchers(game: InstalledGame): RazerBackgroundGameMatcher[] {
  return game.matchers.map(matcher => matcher.kind === 'executablePath'
    ? {executable: matcher.value, packageFamilyName: null, source: game.sources.join(',')}
    : {executable: null, packageFamilyName: matcher.value, source: game.sources.join(',')});
}

export function mergeScannedGame(
  config: RazerBackgroundConfig,
  game: InstalledGame,
  statuses: readonly RazerPollingStatus[],
  userEdited: boolean,
): boolean {
  const existing = config.games.find(item => item.id === game.logicalId);
  if (existing?.userEdited) return false;
  // Automatic scans respect a removal; an explicit add (userEdited) undoes it.
  if (isDismissedGame(config, game.logicalId)) {
    if (!userEdited) return false;
    config.dismissedGameIds = config.dismissedGameIds!.filter(id => id !== game.logicalId);
  }
  const matchers = scannedGameMatchers(game);
  const deviceRatesHz = {...existing?.deviceRatesHz};
  for (const status of connectedRazerStatuses(statuses)) {
    const rates = verifiedRatesForStatus(config, status);
    const rate = rates[rates.length - 1];
    if (rate != null) deviceRatesHz[status.device.deviceId] ??= rate;
  }
  const next: RazerBackgroundGame = {
    ...existing,
    id: game.logicalId,
    name: game.name,
    enabled: matchers.length > 0,
    userEdited,
    matchers,
    deviceRatesHz,
  };
  if (existing) Object.assign(existing, next);
  else config.games.push(next);
  return true;
}

export const MANUAL_GAME_ID_PREFIX = 'manual-';

export function isDismissedGame(config: RazerBackgroundConfig, gameId: string): boolean {
  return config.dismissedGameIds?.includes(gameId) ?? false;
}

export function removeGame(config: RazerBackgroundConfig, gameId: string): boolean {
  const index = config.games.findIndex(game => game.id === gameId);
  if (index < 0) return false;
  config.games.splice(index, 1);
  // Manual games have no scan source; scanned ones would come back on the
  // next automatic scan unless the removal is remembered.
  if (!gameId.startsWith(MANUAL_GAME_ID_PREFIX) && !isDismissedGame(config, gameId)) {
    config.dismissedGameIds = [...config.dismissedGameIds ?? [], gameId];
  }
  return true;
}

export function createManualGame(
  id: string,
  name: string,
  executablePaths: readonly string[],
  statuses: readonly RazerPollingStatus[],
  config?: RazerBackgroundConfig,
): RazerBackgroundGame {
  const seen = new Set<string>();
  const paths = executablePaths.filter((path) => {
    const key = path.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const deviceRatesHz: Record<string, number> = {};
  for (const status of connectedRazerStatuses(statuses)) {
    // Match scanned games: model presets verified earlier count as confirmed.
    const rate = config
      ? lastRate(verifiedRatesForStatus(config, status))
      : highestConfirmedRate(status);
    if (rate != null) deviceRatesHz[status.device.deviceId] = rate;
  }
  return {
    id,
    name: name.trim(),
    enabled: paths.length > 0,
    userEdited: true,
    matchers: paths.map(executable => ({
      executable,
      packageFamilyName: null,
      source: 'manual',
    })),
    deviceRatesHz,
  };
}
