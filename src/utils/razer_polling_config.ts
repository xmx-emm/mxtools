import type {
  RazerBackgroundConfig,
  RazerBackgroundGame,
  RazerBackgroundGameMatcher,
} from '@/types/background_runtime.ts';
import type {InstalledGame} from '@/types/game_scan.ts';
import type {RazerPollingStatus} from '@/types/razer_polling.ts';

export function connectedRazerStatuses(statuses: readonly RazerPollingStatus[]) {
  return statuses.filter(status => status.available);
}

export function confirmedRates(status: RazerPollingStatus): number[] {
  const rates = new Set(status.supportedRatesHz);
  if (status.currentRateHz != null) rates.add(status.currentRateHz);
  return [...rates].sort((left, right) => left - right);
}

export function highestConfirmedRate(status: RazerPollingStatus): number | null {
  const rates = confirmedRates(status);
  return rates[rates.length - 1] ?? null;
}

export function syncConnectedDeviceProfiles(
  config: RazerBackgroundConfig,
  statuses: readonly RazerPollingStatus[],
) {
  for (const status of connectedRazerStatuses(statuses)) {
    const deviceId = status.device.deviceId;
    const existing = config.deviceProfiles[deviceId];
    const rates = confirmedRates(status);
    if (!existing && status.currentRateHz == null) continue;
    config.deviceProfiles[deviceId] = {
      ...existing,
      idleRateHz: existing?.idleRateHz ?? status.currentRateHz!,
      verifiedRatesHz: existing?.verifiedRatesHz.length
        ? existing.verifiedRatesHz
        : rates,
    };
  }
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
  const matchers = scannedGameMatchers(game);
  const deviceRatesHz = {...existing?.deviceRatesHz};
  for (const status of connectedRazerStatuses(statuses)) {
    const rate = highestConfirmedRate(status);
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

export function createManualGame(
  id: string,
  name: string,
  executablePaths: readonly string[],
  statuses: readonly RazerPollingStatus[],
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
    const rate = highestConfirmedRate(status);
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
