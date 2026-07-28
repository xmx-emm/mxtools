import {describe, expect, it} from 'vitest';
import ApexGameSettingsData from '@/data/apex_game_settings.ts';
import type {ApexBinding} from '@/types/apex_game_settings.ts';
import {
  findApexBindingConflict,
  validateApexGameSettingsCatalog,
} from '@/utils/game/apex_game_settings.ts';

const binding = (id: string, input: string): ApexBinding => ({
  id,
  input,
  command: '+test',
  context: 0,
  heldCommand: null,
  editable: true,
  occurrence: 0,
});

describe('Apex game settings catalog', () => {
  it('has unique keys and complete controls', () => {
    expect(validateApexGameSettingsCatalog(ApexGameSettingsData)).toEqual([]);
  });

  it('keeps settings and profile keys distinct by file', () => {
    const keys = ApexGameSettingsData.map(field => `${field.file}:${field.key}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('Apex binding conflict checks', () => {
  const bindings = [binding('one', 'w'), binding('two', 'MOUSE1')];

  it('rejects a key already used by another binding, case-insensitively', () => {
    expect(findApexBindingConflict(bindings, 'one', 'MOUSE1')?.id).toBe('two');
  });

  it('allows a binding to keep its current key', () => {
    expect(findApexBindingConflict(bindings, 'one', 'W')).toBeUndefined();
  });
});
