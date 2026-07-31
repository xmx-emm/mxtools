import ApexVideoConfig from '@/data/apex_video_config.ts';
import ApexGameSettingsData from '@/data/apex_game_settings.ts';
import {
  collectVideoConfigIdentifiers,
  isApexVideoConfigImpl,
} from '@/types/apex.ts';
import {
  APEX_CONFIG_SNAPSHOT_KIND,
  APEX_CONFIG_SNAPSHOT_VERSION,
  type ApexConfigSnapshot,
  type ApexConfigSnapshotExportSelection,
  type ApexConfigSnapshotVideoPreviewItem,
} from '@/types/apex_config_snapshot.ts';
import type {
  ApexBindingSnapshot,
  ApexGameSettingsSnapshot,
} from '@/types/apex_game_settings.ts';

export class ApexConfigSnapshotParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApexConfigSnapshotParseError';
  }
}

export type ApexConfigSnapshotSettingsGroup = 'gameSettings' | 'aiming' | 'controller';

export type ApexConfigSnapshotSettingsGroups = Record<
  ApexConfigSnapshotSettingsGroup,
  Pick<ApexGameSettingsSnapshot, 'settings' | 'profile'>
>;

/** Hardware endpoint IDs are machine-local and must never move between devices. */
export const APEX_MACHINE_LOCAL_GAME_SETTING_KEYS = new Set([
  'settings:miles_output_device',
  'settings:voice_input_device',
]);

function isMachineLocalGameSetting(file: 'settings' | 'profile', key: string): boolean {
  return APEX_MACHINE_LOCAL_GAME_SETTING_KEYS.has(`${file}:${key}`);
}

const gameSettingGroupByKey = new Map(
  ApexGameSettingsData.map(field => [
    `${field.file}:${field.key}`,
    field.section === 'aiming' || field.section === 'controller'
      ? field.section
      : 'gameSettings',
  ] as const),
);

function settingsGroupForKey(
  file: 'settings' | 'profile',
  key: string,
): ApexConfigSnapshotSettingsGroup {
  const catalogGroup = gameSettingGroupByKey.get(`${file}:${key}`);
  if (catalogGroup) return catalogGroup;
  if (file === 'profile'
    && (key.startsWith('gamepad_') || key.startsWith('joy_')
      || key === 'gameCursor_Velocity')) {
    return 'controller';
  }
  return 'gameSettings';
}

function emptySettingsGroup(): Pick<ApexGameSettingsSnapshot, 'settings' | 'profile'> {
  return {settings: {}, profile: {}};
}

/** Split known aiming and controller values from the remaining game settings. */
export function splitApexGameSettingsSnapshot(
  snapshot: ApexGameSettingsSnapshot,
): ApexConfigSnapshotSettingsGroups {
  const groups: ApexConfigSnapshotSettingsGroups = {
    gameSettings: emptySettingsGroup(),
    aiming: emptySettingsGroup(),
    controller: emptySettingsGroup(),
  };

  for (const file of ['settings', 'profile'] as const) {
    for (const [key, value] of Object.entries(snapshot[file])) {
      if (isMachineLocalGameSetting(file, key)) continue;
      const group = settingsGroupForKey(file, key);
      groups[group][file][key] = value;
    }
  }
  return groups;
}

export function collectApexGameSettingsGroups(
  snapshot: ApexGameSettingsSnapshot,
  selectedGroups: ApexConfigSnapshotSettingsGroup[],
): Pick<ApexGameSettingsSnapshot, 'settings' | 'profile'> {
  const groups = splitApexGameSettingsSnapshot(snapshot);
  const result = emptySettingsGroup();
  for (const group of selectedGroups) {
    Object.assign(result.settings, groups[group].settings);
    Object.assign(result.profile, groups[group].profile);
  }
  return result;
}

function isPlainStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  for (const [k, v] of Object.entries(value)) {
    if (typeof k !== 'string' || typeof v !== 'string') {
      return false;
    }
  }
  return true;
}

/**
 * videoconfig keys are written into a quoted key/value file.  Keep the
 * snapshot boundary deliberately narrower than the native parser so a local
 * hand-edited JSON file cannot inject quotes, line breaks, or control bytes.
 */
export function isValidApexVideoConfigKey(key: string): boolean {
  if (!/^setting\.[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(key)) return false;
  for (const character of key) {
    const code = character.charCodeAt(0);
    if (character === '"' || code <= 0x1f || code === 0x7f) return false;
  }
  return true;
}

export function isValidApexVideoConfigValue(value: string): boolean {
  return !Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return character === '"' || code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  });
}

function validateVideoConfigRecord(value: Record<string, string>): void {
  if (Object.entries(value).some(([key, item]) => (
    !isValidApexVideoConfigKey(key) || !isValidApexVideoConfigValue(item)
  ))) {
    throw new ApexConfigSnapshotParseError('apex.configSnapshot.errors.invalidVideoConfig');
  }
}

function isApexBindingSnapshot(value: unknown): value is ApexBindingSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return typeof item.input === 'string'
    && item.input.length > 0
    && typeof item.command === 'string'
    && item.command.length > 0
    && typeof item.context === 'number'
    && Number.isInteger(item.context)
    && (item.context === 0 || item.context === 1)
    && typeof item.occurrence === 'number'
    && Number.isInteger(item.occurrence)
    && item.occurrence >= 0
    && (item.heldCommand === undefined
      || item.heldCommand === null
      || typeof item.heldCommand === 'string');
}

function apexBindingSnapshotIdentity(binding: ApexBindingSnapshot): string {
  return [
    binding.command.toLowerCase(),
    (binding.heldCommand ?? '').toLowerCase(),
    binding.context,
    binding.occurrence,
  ].join('\u001f');
}

function apexBindingSnapshotSlot(binding: ApexBindingSnapshot): string {
  return [
    binding.command.toLowerCase(),
    (binding.heldCommand ?? '').toLowerCase(),
    binding.context,
  ].join('\u001f');
}

/** 从当前状态组装快照（未勾选的块省略字段） */
export function buildApexConfigSnapshot(input: {
  selection: ApexConfigSnapshotExportSelection;
  launchOptionsRaw?: string;
  videoConfig?: Record<string, string>;
  gameSettings?: ApexGameSettingsSnapshot;
  exportedAt?: string;
}): ApexConfigSnapshot {
  const {selection} = input;
  if (!selection.launchOptions && !selection.videoConfig
    && !selection.gameSettings && !selection.aiming
    && !selection.controller && !selection.bindings) {
    throw new ApexConfigSnapshotParseError('apex.configSnapshot.errors.nothingSelected');
  }

  const snapshot: ApexConfigSnapshot = {
    version: APEX_CONFIG_SNAPSHOT_VERSION,
    kind: APEX_CONFIG_SNAPSHOT_KIND,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
  };

  if (selection.launchOptions) {
    snapshot.launchOptions = {raw: input.launchOptionsRaw ?? ''};
  }
  if (selection.videoConfig) {
    snapshot.videoConfig = {...(input.videoConfig ?? {})};
    validateVideoConfigRecord(snapshot.videoConfig);
  }
  if (selection.gameSettings || selection.aiming || selection.controller || selection.bindings) {
    const selectedGroups: ApexConfigSnapshotSettingsGroup[] = [];
    if (selection.gameSettings) selectedGroups.push('gameSettings');
    if (selection.aiming) selectedGroups.push('aiming');
    if (selection.controller) selectedGroups.push('controller');
    const selectedSettings = collectApexGameSettingsGroups(
      input.gameSettings ?? {settings: {}, profile: {}},
      selectedGroups,
    );
    snapshot.gameSettings = {
      settings: selectedSettings.settings,
      profile: selectedSettings.profile,
      ...(selection.bindings
        ? {bindings: (input.gameSettings?.bindings ?? []).map(binding => ({...binding}))}
        : {}),
    };
  }
  return snapshot;
}

export function stringifyApexConfigSnapshot(snapshot: ApexConfigSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

/** 校验并解析快照 JSON 文本 */
export function parseApexConfigSnapshot(text: string): ApexConfigSnapshot {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApexConfigSnapshotParseError('apex.configSnapshot.errors.invalidJson');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ApexConfigSnapshotParseError('apex.configSnapshot.errors.invalidShape');
  }
  const obj = data as Record<string, unknown>;
  if (obj.kind !== APEX_CONFIG_SNAPSHOT_KIND) {
    throw new ApexConfigSnapshotParseError('apex.configSnapshot.errors.unknownKind');
  }
  if (obj.version !== APEX_CONFIG_SNAPSHOT_VERSION) {
    throw new ApexConfigSnapshotParseError('apex.configSnapshot.errors.unsupportedVersion');
  }
  if (typeof obj.exportedAt !== 'string') {
    throw new ApexConfigSnapshotParseError('apex.configSnapshot.errors.invalidShape');
  }

  const snapshot: ApexConfigSnapshot = {
    version: APEX_CONFIG_SNAPSHOT_VERSION,
    kind: APEX_CONFIG_SNAPSHOT_KIND,
    exportedAt: obj.exportedAt,
  };

  if ('launchOptions' in obj && obj.launchOptions !== undefined) {
    const lo = obj.launchOptions;
    if (typeof lo !== 'object' || lo === null || Array.isArray(lo)) {
      throw new ApexConfigSnapshotParseError('apex.configSnapshot.errors.invalidLaunchOptions');
    }
    const raw = (lo as Record<string, unknown>).raw;
    if (typeof raw !== 'string') {
      throw new ApexConfigSnapshotParseError('apex.configSnapshot.errors.invalidLaunchOptions');
    }
    snapshot.launchOptions = {raw};
  }

  if ('videoConfig' in obj && obj.videoConfig !== undefined) {
    if (!isPlainStringRecord(obj.videoConfig)) {
      throw new ApexConfigSnapshotParseError('apex.configSnapshot.errors.invalidVideoConfig');
    }
    validateVideoConfigRecord(obj.videoConfig);
    snapshot.videoConfig = {...obj.videoConfig};
  }

  if ('gameSettings' in obj && obj.gameSettings !== undefined) {
    const value = obj.gameSettings;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new ApexConfigSnapshotParseError('apex.configSnapshot.errors.invalidGameSettings');
    }
    const game = value as Record<string, unknown>;
    if (!isPlainStringRecord(game.settings) || !isPlainStringRecord(game.profile)) {
      throw new ApexConfigSnapshotParseError('apex.configSnapshot.errors.invalidGameSettings');
    }
    const gameSettings = Object.fromEntries(
      Object.entries(game.settings).filter(([key]) => !isMachineLocalGameSetting('settings', key)),
    );
    const gameProfile = Object.fromEntries(
      Object.entries(game.profile).filter(([key]) => !isMachineLocalGameSetting('profile', key)),
    );
    let bindings: ApexGameSettingsSnapshot['bindings'];
    if (game.bindings !== undefined) {
      if (!Array.isArray(game.bindings) || !game.bindings.every(isApexBindingSnapshot)) {
        throw new ApexConfigSnapshotParseError('apex.configSnapshot.errors.invalidBindings');
      }
      const identities = new Set<string>();
      const slots = new Set<string>();
      for (const binding of game.bindings) {
        const identity = apexBindingSnapshotIdentity(binding);
        const slot = apexBindingSnapshotSlot(binding);
        if (identities.has(identity) || slots.has(slot)) {
          throw new ApexConfigSnapshotParseError('apex.configSnapshot.errors.invalidBindings');
        }
        identities.add(identity);
        slots.add(slot);
      }
      bindings = game.bindings.map(binding => ({...binding}));
    }
    snapshot.gameSettings = {
      settings: {...gameSettings},
      profile: {...gameProfile},
      ...(bindings ? {bindings} : {}),
    };
  }

  if (!snapshot.launchOptions && !snapshot.videoConfig && !snapshot.gameSettings) {
    throw new ApexConfigSnapshotParseError('apex.configSnapshot.errors.emptySnapshot');
  }

  return snapshot;
}

function formatValuesPreview(keys: string[], videoConfig: Record<string, string>): string {
  return keys
    .map((k) => `${k}=${videoConfig[k] ?? ''}`)
    .join(', ');
}

/**
 * 将 videoConfig 映射为预览行：优先按 apex_video_config schema 分组，
 * 未收录的键单独成行。
 */
export function buildVideoConfigPreviewItems(
  videoConfig: Record<string, string>,
): ApexConfigSnapshotVideoPreviewItem[] {
  const remaining = new Set(Object.keys(videoConfig));
  const items: ApexConfigSnapshotVideoPreviewItem[] = [];

  for (const row of ApexVideoConfig) {
    if (!isApexVideoConfigImpl(row)) continue;
    const keys = collectVideoConfigIdentifiers(row).filter((k) => remaining.has(k));
    if (keys.length === 0) continue;
    for (const k of keys) remaining.delete(k);
    items.push({
      id: row.identifier,
      labelKey: row.name,
      keys,
      valuesPreview: formatValuesPreview(keys, videoConfig),
    });
  }

  const leftover = Array.from(remaining).sort();
  for (const key of leftover) {
    items.push({
      id: `raw:${key}`,
      labelKey: null,
      rawKey: key,
      keys: [key],
      valuesPreview: formatValuesPreview([key], videoConfig),
    });
  }

  return items;
}

/** 按项模式：由选中的 preview item 收集要写入的键值 */
export function collectSelectedVideoUpdates(
  videoConfig: Record<string, string>,
  items: ApexConfigSnapshotVideoPreviewItem[],
  selectedIds: string[],
): Record<string, string> {
  const selected = new Set(selectedIds);
  const updates: Record<string, string> = {};
  for (const item of items) {
    if (!selected.has(item.id)) continue;
    for (const key of item.keys) {
      if (key in videoConfig) {
        updates[key] = videoConfig[key];
      }
    }
  }
  return updates;
}

export function truncateLaunchOptionsPreview(raw: string, maxLen = 120): string {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen)}…`;
}
