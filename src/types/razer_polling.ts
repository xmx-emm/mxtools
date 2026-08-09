export interface RazerPollingDevice {
  deviceId: string;
  identityPersistent: boolean;
  name: string;
  vendorId: number;
  productId: number;
  connection: 'wired' | 'wireless' | string;
}

export interface RazerPollingStatus {
  available: boolean;
  device: RazerPollingDevice;
  currentRateHz: number | null;
  baselineRateHz: number | null;
  supportedRatesHz: number[];
  candidateRatesHz: number[];
  busy: boolean;
  faulted: boolean;
  possiblyChanged: boolean;
  lastError: string | null;
  autoEnabled: boolean;
  autoTargetRateHz: number | null;
  activeProfileId: string | null;
}

export interface RazerPollingProfile {
  profileId: string;
  displayName: string;
  executablePaths: string[];
  packageFamilyNames: string[];
  rateHz: number;
}

export interface RazerPollingDeviceConfig {
  deviceId: string;
  idleRateHz: number;
  profiles: RazerPollingProfile[];
}

export interface RazerPollingConfig {
  schemaVersion: 1;
  enabled: boolean;
  devices: RazerPollingDeviceConfig[];
}

export interface RazerPollingApplyResult {
  deviceId: string;
  changed: boolean;
  requestedRateHz: number;
  previousRateHz: number;
  currentRateHz: number;
  restored: boolean;
  possiblyChanged: boolean;
}

export interface RazerPollingCapabilityResult {
  deviceId: string;
  originalRateHz: number | null;
  supportedRatesHz: number[];
  highestConfirmedRateHz: number | null;
  restoredRateHz: number | null;
  complete: boolean;
  stoppedReason: string | null;
  faulted: boolean;
  possiblyChanged: boolean;
}
