import fields, {apexGameSettingsReviewIgnoredKeys} from '@/data/apex_game_settings.ts';
import {apexGameSettingsReviewNotes} from '@/data/apex_game_settings_review.ts';
import type {ApexGameSettingsFile} from '@/types/apex_game_settings.ts';

const knownKeys = new Set([
  ...fields.flatMap(field => [field.key, field.readKey, ...(field.writeKeys ?? [])]
    .filter((key): key is string => Boolean(key)).map(key => `${field.file}:${key}`)),
  'profile:toggle_on_jump_to_deactivate_changed',
]);

interface ApexGameSettingsReviewEntry {
  file: ApexGameSettingsFile;
  key: string;
  value: string;
  descriptionKey: string;
}

/** Show unowned values with the evidence available, including newly added keys. */
export function getApexGameSettingsReviewEntries(
  values: Record<ApexGameSettingsFile, Record<string, string>>,
  query = '',
  translate: (key: string) => string = key => key,
): ApexGameSettingsReviewEntry[] {
  const entries: ApexGameSettingsReviewEntry[] = [];
  const search = query.trim().toLowerCase();
  for (const file of ['settings', 'profile'] as const) {
    for (const [key, value] of Object.entries(values[file])) {
      const qualifiedKey = `${file}:${key}` as const;
      if (knownKeys.has(qualifiedKey) || apexGameSettingsReviewIgnoredKeys.has(qualifiedKey)) continue;
      const descriptionKey = apexGameSettingsReviewNotes[qualifiedKey]?.descriptionKey
        ?? 'apexGameSettings.unknownDescription';
      const haystack = `${file} ${key} ${value} ${translate(descriptionKey)}`.toLowerCase();
      if (!search || haystack.includes(search)) entries.push({file, key, value, descriptionKey});
    }
  }
  return entries.sort((a, b) => a.key.localeCompare(b.key));
}
