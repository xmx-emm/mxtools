import {describe, expect, it} from 'vitest';
import type {RazerBackgroundConfig} from '@/types/background_runtime.ts';
import type {InstalledGame} from '@/types/game_scan.ts';
import type {RazerPollingStatus} from '@/types/razer_polling.ts';
import {
  createManualGame,
  mergeScannedGame,
  recordVerifiedModelPreset,
  removeGame,
  syncConnectedDeviceProfiles,
} from '@/utils/razer_polling_config.ts';

function status(
  deviceId: string,
  currentRateHz: number | null,
  supportedRatesHz: number[] = currentRateHz == null ? [] : [currentRateHz],
  productId = 1,
): RazerPollingStatus {
  return {
    available: true,
    device: {
      deviceId,
      identityPersistent: true,
      name: deviceId,
      vendorId: 0x1532,
      productId,
      connection: 'wired',
    },
    currentRateHz,
    baselineRateHz: null,
    supportedRatesHz,
    candidateRatesHz: [125, 250, 500, 1000, 2000, 4000, 8000],
    busy: false,
    faulted: false,
    possiblyChanged: false,
    lastError: null,
    autoEnabled: false,
    autoTargetRateHz: null,
    activeProfileId: null,
  };
}

function emptyConfig(): RazerBackgroundConfig {
  return {enabled: true, deviceProfiles: {}, modelPresets: {}, games: []};
}

function scannedGame(): InstalledGame {
  return {
    logicalId: 'apex-legends',
    name: 'Apex Legends',
    isShooter: true,
    sources: ['steam'],
    installations: [],
    matchers: [{kind: 'executablePath', value: 'D:\\Apex\\r5apex.exe'}],
  };
}

describe('Razer polling game lifecycle', () => {
  it('backfills a rate for a device connected after a user-edited game was added', () => {
    const config = emptyConfig();
    const first = status('device-a', 1000, [500, 1000]);
    mergeScannedGame(config, scannedGame(), [first], true);
    config.games[0].deviceRatesHz['device-a'] = 500;

    const changed = syncConnectedDeviceProfiles(
      config,
      [first, status('device-b', 500, [250, 500, 2000])],
    );

    expect(changed).toBe(true);
    expect(config.games[0].deviceRatesHz).toEqual({'device-a': 500, 'device-b': 2000});
  });

  it('uses verified model presets for manual games', () => {
    const config = emptyConfig();
    config.modelPresets = {'1532:0007': [125, 1000, 4000]};
    const game = createManualGame(
      'manual-1',
      'Custom',
      ['D:\\Game\\game.exe'],
      [status('device-a', 1000, [1000], 7)],
      config,
    );
    expect(game.deviceRatesHz).toEqual({'device-a': 4000});
  });

  it('keeps the idle rate inside the newly verified rate set', () => {
    const config = emptyConfig();
    config.deviceProfiles['device-a'] = {idleRateHz: 8000, verifiedRatesHz: [8000]};
    const device = status('device-a', 1000, [1000]);

    expect(recordVerifiedModelPreset(config, device, [500, 1000, 2000])).toBe(true);
    expect(config.deviceProfiles['device-a'].idleRateHz).toBe(1000);

    config.deviceProfiles['device-a'].idleRateHz = 500;
    recordVerifiedModelPreset(config, device, [250, 500, 1000]);
    expect(config.deviceProfiles['device-a'].idleRateHz).toBe(500);
  });

  it('remembers a removed scanned game until the user adds it back explicitly', () => {
    const config = emptyConfig();
    const devices = [status('device-a', 1000, [1000])];
    mergeScannedGame(config, scannedGame(), devices, false);

    expect(removeGame(config, 'apex-legends')).toBe(true);
    expect(config.games).toEqual([]);
    expect(mergeScannedGame(config, scannedGame(), devices, false)).toBe(false);
    expect(config.games).toEqual([]);

    expect(mergeScannedGame(config, scannedGame(), devices, true)).toBe(true);
    expect(config.games.map(game => game.id)).toEqual(['apex-legends']);
    expect(config.dismissedGameIds).toEqual([]);
  });

  it('removes manual games without recording a scan dismissal', () => {
    const config = emptyConfig();
    config.games.push(createManualGame('manual-1', 'Custom', ['D:\\a.exe'], [], config));
    expect(removeGame(config, 'manual-1')).toBe(true);
    expect(config.dismissedGameIds).toBeUndefined();
    expect(removeGame(config, 'missing')).toBe(false);
  });
});
