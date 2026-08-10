export type ApexGameSettingsFile = 'settings' | 'profile';

export interface ApexSettingsFileReport {
  path: string;
  revision: string;
  values: Record<string, string>;
  unknownKeys: string[];
  backupAvailable: boolean;
}

export interface ApexBinding {
  id: string;
  input: string;
  command: string;
  context: number;
  heldCommand?: string | null;
  editable: boolean;
  occurrence: number;
  /** Frontend-only source binding used when drafting a new second slot. */
  templateId?: string;
}

export interface ApexGameSettingsReport {
  settings: ApexSettingsFileReport;
  profile: ApexSettingsFileReport;
  bindings: ApexBinding[];
}

export type ApexBindingMutation =
  | {operation: 'update'; id: string; input: string}
  | {operation: 'delete'; id: string}
  | {operation: 'create'; templateId: string; input: string; context: 0 | 1};

export interface ApexGameSettingsApplyRequest {
  settingsRevision: string;
  profileRevision: string;
  settingsUpdates: Record<string, string>;
  profileUpdates: Record<string, string>;
  bindingMutations: ApexBindingMutation[];
  historySource?: import('./apex_history.ts').ApexHistorySource;
  transactionId?: string;
}

export interface ApexGameSettingsRestoreRequest {
  settingsRevision: string;
  profileRevision: string;
  restoreSettings: boolean;
  restoreProfile: boolean;
}

export type ApexGameSettingsSection =
  | 'gameplay'
  | 'aiming'
  | 'bindings'
  | 'controller'
  | 'audio'
  | 'hud'
  | 'accessibility'
  | 'privacy'
  // Kept for persisted state written before the in-game sections were split.
  | 'interface'
  | 'unknown';

export type ApexGameSettingControl = 'toggle' | 'number' | 'enum' | 'rgb';

export interface ApexGameSettingOption {
  value: string;
  labelKey: string;
  descriptionKey?: string;
}

export interface ApexGameSettingDependency {
  file: ApexGameSettingsFile;
  key: string;
  value: string;
}

export interface ApexGameSettingDefinition {
  id: string;
  file: ApexGameSettingsFile;
  key: string;
  section: Exclude<ApexGameSettingsSection, 'bindings' | 'unknown'>;
  labelKey: string;
  descriptionKey: string;
  control: ApexGameSettingControl;
  min?: number;
  max?: number;
  step?: number;
  options?: ApexGameSettingOption[];
  disabledWhen?: ApexGameSettingDependency | ApexGameSettingDependency[];
  readKey?: string;
  writeKeys?: string[];
}

export interface ApexBindingSnapshot {
  input: string;
  command: string;
  context: number;
  heldCommand?: string | null;
  occurrence: number;
}

export interface ApexGameSettingsSnapshot {
  settings: Record<string, string>;
  profile: Record<string, string>;
  bindings?: ApexBindingSnapshot[];
}
