import type {RazerPollingStatus} from '@/types/razer_polling.ts';

export type BackgroundLaunchMode = 'interactive' | 'autostart';
export type BackgroundFeatureState = 'disabled' | 'blockedByBeta' | 'notConfigured' | 'ready';

export interface RazerBackgroundDeviceProfile {
  idleRateHz: number;
  verifiedRatesHz: number[];
  [key: string]: unknown;
}

export interface RazerBackgroundGameMatcher {
  executable?: string | null;
  packageFamilyName?: string | null;
  source?: string | null;
  [key: string]: unknown;
}

export interface RazerBackgroundGame {
  id: string;
  name: string;
  enabled: boolean;
  userEdited: boolean;
  matchers: RazerBackgroundGameMatcher[];
  deviceRatesHz: Record<string, number>;
  [key: string]: unknown;
}

export interface RazerBackgroundConfig {
  enabled: boolean;
  deviceProfiles: Record<string, RazerBackgroundDeviceProfile>;
  games: RazerBackgroundGame[];
  [key: string]: unknown;
}

export interface BackgroundRuntimeConfig {
  schemaVersion: number;
  autostart: boolean;
  betaFeaturesEnabled: boolean;
  locale: 'system' | 'zh-CN' | 'en-US';
  apexQ: Record<string, unknown> & {
    enabled: boolean;
    setupDone: boolean;
    hotkey: string;
  };
  razer: RazerBackgroundConfig;
}

export interface BackgroundRuntimeSnapshot {
  autostartSupported: boolean;
  autostartEnabled: boolean;
  configuredAutostart: boolean;
  launchMode: BackgroundLaunchMode;
  apexQState: BackgroundFeatureState;
  razerState: BackgroundFeatureState;
  config: BackgroundRuntimeConfig;
}

export interface BackgroundRuntimeRazerUpdate {
  snapshot: BackgroundRuntimeSnapshot;
  statuses: RazerPollingStatus[];
}
