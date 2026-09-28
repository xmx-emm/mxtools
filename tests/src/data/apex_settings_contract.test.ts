import {describe, expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import gameFields from '@/data/apex_game_settings.ts';
import {apexBindingCommandLabels} from '@/data/apex_game_settings.ts';
import videoRows from '@/data/apex_video_config.ts';
import {collectVideoConfigIdentifiers, isApexVideoConfigImpl} from '@/types/apex.ts';
import type {ApexVideoConfigField} from '@/types/apex.ts';
import {isValidApexGameSettingValue, validateApexGameSettingsCatalog} from '@/utils/game/apex_game_settings.ts';

type Sample = {id: string; file: 'settings' | 'profile' | 'video'; key: string; value: string};

const gameSamples: Sample[] = gameFields.flatMap(field => {
  const keys = field.writeKeys ?? [field.readKey ?? field.key];
  const samples: Sample[] = [];
  const add = (key: string, value: string) => samples.push({id: field.id, file: field.file, key, value});
  if (field.options) {
    for (const option of field.options) {
      for (const key of keys) add(key, option.values?.[key] ?? option.value);
    }
  } else {
    const values = field.control === 'rgb' ? ['', '0 0 0', '255 255 255', '13 127 231']
      : field.control === 'packed-rgb' ? ['0', '16777215', '123456']
        : [field.min!, field.max!, Math.min(field.max!, field.min! + field.step!)].map(String);
    for (const key of keys) for (const value of values) add(key, value);
  }
  return samples;
});

const videoSamples: Sample[] = videoRows.filter(isApexVideoConfigImpl).flatMap(row => {
  const samples: Sample[] = [];
  const add = (key: string, value: string) => samples.push({id: row.identifier, file: 'video', key, value});
  for (const option of [...row.options ?? [], ...row.coverageOptions ?? []]) {
    for (const [key, value] of Object.entries(option.values)) add(key, value);
  }
  const fields: ApexVideoConfigField[] = row.fields ?? (row.valueType ? [{...row, valueType: row.valueType}] : []);
  for (const field of fields) {
    if (field.valueType === 'boolean') {
      add(field.identifier, field.offValue ?? '0');
      add(field.identifier, field.onValue ?? '1');
    } else if (field.min !== undefined && field.max !== undefined) {
      add(field.identifier, String(field.min));
      add(field.identifier, String(field.max));
    }
  }
  return samples;
});

describe('complete Apex editable-setting contract', () => {
  it('labels the new shipped observer binding', () => {
    expect(apexBindingCommandLabels.toggle_obs_auto_mapcam).toBe('observerAutoMapCamera');
  });
  it('covers every control, stored key, option and numeric boundary', () => {
    expect(validateApexGameSettingsCatalog(gameFields)).toEqual([]);
    expect(new Set(gameSamples.map(sample => sample.id)).size).toBe(gameFields.length);
    expect(new Set(videoSamples.map(sample => sample.key))).toEqual(new Set(
      videoRows.filter(isApexVideoConfigImpl).flatMap(collectVideoConfigIdentifiers),
    ));
    for (const sample of gameSamples) {
      expect(isValidApexGameSettingValue(gameFields, sample.file as 'settings' | 'profile', sample.key, sample.value),
        JSON.stringify(sample)).toBe(true);
    }
  });

  it.skipIf(!process.env.MXTOOLS_APEX_VIDEO_TEST_EXE)('accepts the whole catalog natively and returns every reset setting', () => {
    const root = mkdtempSync(join(tmpdir(), 'mxtools-apex-contract-'));
    try {
      writeFileSync(join(root, 'catalog.json'), JSON.stringify([...gameSamples, ...videoSamples]));
      execFileSync(process.env.MXTOOLS_APEX_VIDEO_TEST_EXE!, [
        '--exact', 'game::apex_settings::tests::complete_settings_catalog_native_bridge', '--ignored', '--nocapture',
      ], {env: {...process.env, MXTOOLS_APEX_CONTRACT_ROOT: root}, windowsHide: true, timeout: 15000});
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  });
});
