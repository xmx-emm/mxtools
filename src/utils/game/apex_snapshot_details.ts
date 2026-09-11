import type {ApexConfigSnapshot} from '@/types/apex_config_snapshot.ts';
import ApexGameSettingsData, {apexBindingCommandLabels} from '@/data/apex_game_settings.ts';
import {splitApexGameSettingsSnapshot, buildVideoConfigPreviewItems} from './apex_config_snapshot.ts';
import {tokenizeApexLaunchOptions} from './apex_custom_launch_options.ts';

export type SnapshotBlock = 'launch' | 'aiming' | 'controller' | 'gameSettings' | 'bindings' | 'video';
export interface SnapshotDetail { id: string; labelKey?: string; key: string; value: string; source: string }

export function snapshotDetails(snapshot: ApexConfigSnapshot, block: SnapshotBlock): SnapshotDetail[] {
  if (block === 'launch') {
    const raw = snapshot.launchOptions?.raw ?? '';
    const tokens = tokenizeApexLaunchOptions(raw);
    const starts = tokens.filter(token => /^[+-][A-Za-z_]/.test(token.value) && !token.hasQuotes);
    if (!starts.length) return raw ? [{id: 'raw', key: 'launchOptions', value: raw, source: ''}] : [];
    const rows = starts.map((token, index) => ({
      id: String(index), key: token.raw,
      value: raw.slice(token.end, starts[index + 1]?.start ?? raw.length).trim(), source: '',
    }));
    const prefix = raw.slice(0, starts[0].start).trim();
    return prefix ? [{id: 'prefix', key: 'launchOptions', value: prefix, source: ''}, ...rows] : rows;
  }
  if (block === 'bindings') return (snapshot.gameSettings?.bindings ?? []).map((binding, index) => ({
    id: String(index), key: binding.command,
    labelKey: apexBindingCommandLabels[binding.command]
      ? `apexGameSettings.bindings.${apexBindingCommandLabels[binding.command]}` : undefined,
    value: (binding.input || '—') + (binding.heldCommand ? ` / ${binding.heldCommand}` : ''),
    source: `settings.cfg · ${binding.context + 1} · #${binding.occurrence}`,
  }));
  if (block === 'video') {
    const values = snapshot.videoConfig ?? {};
    const items = buildVideoConfigPreviewItems(values);
    return Object.entries(values).map(([key, value]) => ({
      id: key, key, value, source: 'videoconfig.txt',
      labelKey: items.find(item => item.keys.includes(key))?.labelKey ?? undefined,
    }));
  }
  const group = splitApexGameSettingsSnapshot(snapshot.gameSettings ?? {settings: {}, profile: {}})[block];
  return (['settings', 'profile'] as const).flatMap(file => Object.entries(group[file]).map(([key, value]) => ({
    id: `${file}:${key}`, key, value, source: `${file}.cfg`,
    labelKey: ApexGameSettingsData.find(field => field.file === file
      && (field.key === key || field.writeKeys?.includes(key)))?.labelKey,
  })));
}
