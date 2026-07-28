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
}

export interface ApexGameSettingsReport {
  settings: ApexSettingsFileReport;
  profile: ApexSettingsFileReport;
  bindings: ApexBinding[];
}

export interface ApexBindingUpdate {
  id: string;
  input: string;
}

export interface ApexGameSettingsApplyRequest {
  settingsRevision: string;
  profileRevision: string;
  settingsUpdates: Record<string, string>;
  profileUpdates: Record<string, string>;
  bindingUpdates: ApexBindingUpdate[];
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
  | 'interface'
  | 'unknown';

export type ApexGameSettingControl = 'toggle' | 'number' | 'enum';

export interface ApexGameSettingOption {
  value: string;
  labelKey: string;
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
