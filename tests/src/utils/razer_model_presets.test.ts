import {describe, expect, it} from 'vitest';
import {hasModelPreset, syncConnectedDeviceProfiles, verifiedRatesForStatus, mergeScannedGame} from '@/utils/razer_polling_config.ts';
import type {RazerPollingStatus} from '@/types/razer_polling.ts';
import type {RazerBackgroundConfig} from '@/types/background_runtime.ts';

function device(productId = 0x00e6): RazerPollingStatus {
  return {device: {deviceId: 'receiver', vendorId: 0x1532, productId, identityPersistent: true, name: 'Razer', connection: 'wireless'},
    available: true, currentRateHz: 500, baselineRateHz: null, supportedRatesHz: [500], candidateRatesHz: [],
    busy: false, faulted: false, possiblyChanged: false, lastError: null, autoEnabled: false, autoTargetRateHz: null, activeProfileId: null};
}

describe('verified Razer model presets', () => {
  it('loads the verified receiver and gives a scanned game its known maximum after restart', () => {
    const config: RazerBackgroundConfig = {enabled: false, deviceProfiles: {}, games: []};
    const status = device();
    expect(hasModelPreset(config, status)).toBe(true);
    syncConnectedDeviceProfiles(config, [status]);
    expect(config.deviceProfiles.receiver.verifiedRatesHz).toEqual([125, 250, 500, 1000, 2000, 4000, 8000]);
    expect(config.deviceProfiles.receiver.idleRateHz).toBe(500);
    mergeScannedGame(config, {logicalId: 'apex-legends', name: 'Apex', isShooter: true, sources: ['steam'], installations: [],
      matchers: [{kind: 'executablePath', value: 'D:\\Apex\\r5apex_dx12.exe'}]}, [status], false);
    expect(config.games[0].deviceRatesHz.receiver).toBe(8000);
  });
  it('does not grant another product ID those rates and respects local verification overrides', () => {
    const config: RazerBackgroundConfig = {enabled: false, deviceProfiles: {}, games: []};
    expect(verifiedRatesForStatus(config, device(0x00e7))).toEqual([500]);
    config.modelPresets = {'1532:00e6': [500, 1000]};
    expect(verifiedRatesForStatus(config, device())).toEqual([500, 1000]);
  });
});
