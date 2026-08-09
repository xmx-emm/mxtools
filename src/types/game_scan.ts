export type GameSource = 'steam' | 'epic' | 'xbox' | 'ea' | 'ubisoft' | 'battleNet';
export type GameScanSourceStatus = 'completed' | 'notInstalled' | 'partial' | 'failed';
export type InstalledGameMatcherKind = 'executablePath' | 'packageFamilyName';

export interface InstalledGameMatcher {
  kind: InstalledGameMatcherKind;
  value: string;
}

export interface InstalledGameInstallation {
  source: GameSource;
  sourceGameId?: string;
  installLocation?: string;
  matchers: InstalledGameMatcher[];
}

export interface InstalledGame {
  logicalId: string;
  name: string;
  isShooter: boolean;
  sources: GameSource[];
  installations: InstalledGameInstallation[];
  matchers: InstalledGameMatcher[];
}

export interface GameScanSourceError {
  stage: string;
  message: string;
}

export interface GameSourceScanResult {
  source: GameSource;
  status: GameScanSourceStatus;
  gameCount: number;
  errors: GameScanSourceError[];
}

export interface InstalledGameScanReport {
  games: InstalledGame[];
  sources: GameSourceScanResult[];
}
