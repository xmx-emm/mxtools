import {describe, expect, it} from 'vitest';
import type {RazerBackgroundConfig} from '@/types/background_runtime.ts';
import type {InstalledGame} from '@/types/game_scan.ts';
import type {RazerPollingStatus} from '@/types/razer_polling.ts';
import {
  createManualGame,
  mergeScannedGame,
  syncConnectedDeviceProfiles,
} from '@/utils/razer_polling_config.ts';

function status(
  deviceId: string,
  currentRateHz: number | null,
  supportedRatesHz: number[] = currentRateHz == null ? [] : [currentRateHz],
): RazerPollingStatus {
  return {
    available: true,
    device: {
      deviceId,
      identityPersistent: true,
      name: deviceId,
      vendorId: 0x1532,
      productId: 1,
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
  return {enabled: false, deviceProfiles: {}, games: []};
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

describe('Razer polling background config', () => {
  it('does not guess a device rate when the probe has no confirmed readback', () => {
    const config = emptyConfig();
    syncConnectedDeviceProfiles(config, [status('unknown', null)]);
    expect(config.deviceProfiles).toEqual({});
  });

  it('isolates device profiles and assigns each game its confirmed device maximum', () => {
    const config = emptyConfig();
    const devices = [
      status('device-a', 1000, [500, 1000, 2000]),
      status('device-b', 500, [125, 250, 500]),
    ];
    syncConnectedDeviceProfiles(config, devices);
    mergeScannedGame(config, scannedGame(), devices, false);
    expect(config.deviceProfiles['device-a'].verifiedRatesHz).toEqual([500, 1000, 2000]);
    expect(config.deviceProfiles['device-b'].verifiedRatesHz).toEqual([125, 250, 500]);
    expect(config.games[0].deviceRatesHz).toEqual({'device-a': 2000, 'device-b': 500});
  });

  it('keeps a user-edited game unchanged across later scans', () => {
    const config = emptyConfig();
    const devices = [status('device-a', 1000, [500, 1000, 2000])];
    mergeScannedGame(config, scannedGame(), devices, false);
    config.games[0].name = 'My Apex';
    config.games[0].enabled = false;
    config.games[0].userEdited = true;

    expect(mergeScannedGame(config, {...scannedGame(), name: 'New Catalog Name'}, devices, false))
      .toBe(false);
    expect(config.games[0]).toMatchObject({name: 'My Apex', enabled: false, userEdited: true});
  });

  it('creates a manual game with multiple unique executables and confirmed per-device rates', () => {
    const game = createManualGame(
      'manual-1',
      '  Custom Game  ',
      ['D:\\Game\\one.exe', 'd:\\game\\ONE.exe', 'D:\\Game\\two.exe'],
      [status('device-a', 1000, [500, 1000]), status('unknown', null)],
    );

    expect(game.name).toBe('Custom Game');
    expect(game.matchers.map(matcher => matcher.executable)).toEqual([
      'D:\\Game\\one.exe',
      'D:\\Game\\two.exe',
    ]);
    expect(game.deviceRatesHz).toEqual({'device-a': 1000});
  });
});
