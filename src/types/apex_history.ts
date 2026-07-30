export type ApexConfigScope = 'launch' | 'video' | 'gameSettings';

export type ApexHistorySource =
  | 'apply'
  | 'quickPreset'
  | 'import'
  | 'reset'
  | 'historyRestore'
  | 'legacyBackup';

export interface ApexLauncherRef {
  kind: 'steam' | 'ea';
  id: string;
  name: string;
}

export interface ApexConfigHistoryEntry {
  id: string;
  transactionId: string;
  createdAt: string;
  source: ApexHistorySource;
  scopes: ApexConfigScope[];
  launcher: ApexLauncherRef | null;
}

export interface ApexHistoryRestoreResult {
  historyEntry: ApexConfigHistoryEntry;
  restoredScopes: ApexConfigScope[];
  pendingDefaultGeneration: boolean;
  pendingScopes: ApexConfigScope[];
  launchOptions: string | null;
  videoConfig: Record<string, string> | null;
  gameSettingsReport: import('./apex_game_settings.ts').ApexGameSettingsReport | null;
}

export interface ApexResetResult {
  historyEntry: ApexConfigHistoryEntry;
  pendingScopes: ApexConfigScope[];
}

export interface ApexConfigMutationMeta {
  historySource?: ApexHistorySource;
  transactionId?: string;
}

export interface ApexConfigMutationRequest {
  source: ApexHistorySource;
  transactionId?: string;
  launcher?: ApexLauncherRef | null;
  launchOptions?: string | null;
  videoUpdates?: Record<string, string>;
  gameSettings?: Omit<
    import('./apex_game_settings.ts').ApexGameSettingsApplyRequest,
    'historySource' | 'transactionId'
  > | null;
}

export interface ApexConfigMutationResult {
  historyEntry: ApexConfigHistoryEntry | null;
  changedScopes: ApexConfigScope[];
  launchOptions: string | null;
  videoConfig: Record<string, string> | null;
  gameSettingsReport: import('./apex_game_settings.ts').ApexGameSettingsReport | null;
}
