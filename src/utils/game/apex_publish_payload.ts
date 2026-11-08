import type {ApexConfigSnapshot} from '@/types/apex_config_snapshot.ts';
import type {ApexLauncherRef} from '@/types/apex_history.ts';
import {getApexSnapshotDefaults} from '@/ipc/commands.ts';
import {changedSnapshot} from './apex_snapshot_changes.ts';
import {
  APEX_GAME_MANAGED_VIDEO_CONFIG_KEYS,
  APEX_MACHINE_LOCAL_GAME_SETTING_KEYS,
} from './apex_config_snapshot.ts';
import {tokenizeApexLaunchOptions} from './apex_custom_launch_options.ts';

/** Same limits the online service enforces; checked locally before any upload. */
export const ONLINE_PRESET_TITLE_MAX = 80;
export const ONLINE_PRESET_DESCRIPTION_MAX = 400;

/** Display geometry belongs to one monitor and must not be shared as a preset. */
export const APEX_PUBLISH_DEVICE_VIDEO_KEYS = new Set([
  'setting.defaultres',
  'setting.defaultresheight',
  'setting.last_display_width',
  'setting.last_display_height',
]);

export type PublishRemovalReason = 'device' | 'personal';
export interface PublishRemoval { key: string; reason: PublishRemovalReason }
export interface PublishPayloadResult { snapshot: ApexConfigSnapshot; removed: PublishRemoval[] }

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const PERSONAL_VALUE = [
  /[A-Za-z]:[\\/]/, // Windows drive path
  /\\\\|\\/, // UNC or any backslash path
  /(?:^|[\s"'=])\/(?:Users|home|mnt|Volumes)\//i,
  /[^\s@]+@[^\s@]+\.[^\s@]+/, // e-mail address
];

function looksPersonal(value: string): boolean {
  return PERSONAL_VALUE.some(pattern => pattern.test(value));
}

/** Drop whole launch option groups (flag + its values) that carry a path or e-mail. */
export function sanitizePublishLaunchOptions(raw: string): {raw: string; removed: string[]} {
  const tokens = tokenizeApexLaunchOptions(raw);
  const starts = tokens.filter(token => /^[+-][A-Za-z_]/.test(token.value) && !token.hasQuotes);
  if (!starts.length) return looksPersonal(raw) ? {raw: '', removed: [raw.trim()]} : {raw: raw.trim(), removed: []};
  const kept: string[] = [];
  const removed: string[] = [];
  const prefix = raw.slice(0, starts[0].start).trim();
  if (prefix) (looksPersonal(prefix) ? removed : kept).push(prefix);
  starts.forEach((token, index) => {
    const group = raw.slice(token.start, starts[index + 1]?.start ?? raw.length).trim();
    if (looksPersonal(group)) removed.push(token.value);
    else kept.push(group);
  });
  return {raw: kept.join(' '), removed};
}

/**
 * Build the exact snapshot uploaded by "publish": only values that differ from
 * the game defaults, without monitor geometry, machine-local devices, Apex
 * managed keys, or launch options that reveal local paths / accounts.
 */
export function buildPublishPayload(current: ApexConfigSnapshot, baseline: ApexConfigSnapshot): PublishPayloadResult {
  const diff = changedSnapshot(current, baseline);
  const removed: PublishRemoval[] = [];
  const snapshot: ApexConfigSnapshot = {kind: diff.kind, version: diff.version, exportedAt: new Date().toISOString()};
  if (diff.launchOptions) {
    const clean = sanitizePublishLaunchOptions(diff.launchOptions.raw);
    removed.push(...clean.removed.map(key => ({key, reason: 'personal' as const})));
    if (clean.raw) snapshot.launchOptions = {raw: clean.raw};
  }
  if (diff.videoConfig) {
    const video: Record<string, string> = {};
    for (const [key, value] of Object.entries(diff.videoConfig)) {
      if (APEX_PUBLISH_DEVICE_VIDEO_KEYS.has(key)) removed.push({key, reason: 'device'});
      else if (!APEX_GAME_MANAGED_VIDEO_CONFIG_KEYS.has(key)) video[key] = value;
    }
    if (Object.keys(video).length) snapshot.videoConfig = video;
  }
  if (diff.gameSettings) {
    const strip = (file: 'settings' | 'profile', record: Record<string, string>) => Object.fromEntries(
      Object.entries(record).filter(([key]) => {
        if (!APEX_MACHINE_LOCAL_GAME_SETTING_KEYS.has(`${file}:${key}`)) return true;
        removed.push({key, reason: 'device'});
        return false;
      }));
    const settings = strip('settings', diff.gameSettings.settings);
    const profile = strip('profile', diff.gameSettings.profile);
    const bindings = diff.gameSettings.bindings;
    if (Object.keys(settings).length || Object.keys(profile).length || bindings?.length) {
      snapshot.gameSettings = {settings, profile,
        ...(bindings?.length ? {bindings, ...(diff.gameSettings.bindingsMode ? {bindingsMode: diff.gameSettings.bindingsMode} : {})} : {})};
    }
  }
  return {snapshot, removed};
}

/** Trim, remove control characters and cap a user-entered text field. */
export function cleanPublishText(value: string, max: number): string {
  return Array.from(value.replace(CONTROL_CHARS, ' ').trim()).slice(0, max).join('').trim();
}

/** Parse a `kind:id` launcher selection key used by the Apex store. */
export function launcherRefFromKey(key: string | null | undefined): ApexLauncherRef | null {
  const [kind, ...rest] = (key ?? '').split(':');
  const id = rest.join(':');
  return (kind === 'steam' || kind === 'ea') && id ? {kind, id, name: ''} : null;
}

/** Load the game defaults as a snapshot so callers can diff against them. */
export async function loadApexSnapshotBaseline(launcher: ApexLauncherRef): Promise<ApexConfigSnapshot> {
  const value = await getApexSnapshotDefaults({launcher});
  return {kind: 'apex-config-snapshot', version: 1, exportedAt: '', launchOptions: {raw: ''},
    videoConfig: value.videoConfig, gameSettings: {settings: value.settings, profile: value.profile, bindings: value.bindings}};
}
