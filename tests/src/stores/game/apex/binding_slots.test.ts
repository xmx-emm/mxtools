import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import type {ApexGameSettingsReport} from '@/types/apex_game_settings.ts';
import {useApexStore} from '@/stores/game/apex/index.ts';
import {
  adoptApexGameSettingsReport,
  buildApexGameSettingsMutation,
} from '@/stores/game/apex/actions_settings.ts';

vi.mock('vue-toastification', () => ({
  useToast: () => ({error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn()}),
}));

function gameSettingsReport(value: string): ApexGameSettingsReport {
  return {
    settings: {path: 'settings.cfg', revision: 's', values: {mouse_sensitivity: value}, unknownKeys: [], backupAvailable: false},
    profile: {path: 'profile.cfg', revision: 'p', values: {}, unknownKeys: [], backupAvailable: false},
    bindings: [],
  };
}

beforeEach(() => setActivePinia(createPinia()));

describe('Apex binding slot drafts', () => {
  it('builds independent create and delete mutations for the two UI slots', () => {
    const apex = useApexStore();
    apex.game_settings_report = {
      settings: {path: 'settings.cfg', revision: 's', values: {}, unknownKeys: [], backupAvailable: false},
      profile: {path: 'profile.cfg', revision: 'p', values: {}, unknownKeys: [], backupAvailable: false},
      bindings: [],
    };
    apex.game_settings_bindings = [{
      id: 'binding:0',
      input: 'w',
      command: '+forward',
      context: 0,
      heldCommand: null,
      editable: true,
      occurrence: 0,
    }];
    apex.original_game_settings_bindings = {'binding:0': 'w'};

    apex.set_game_binding_slot('binding:0', null, 'MWHEELUP', 1);
    let mutation = buildApexGameSettingsMutation(apex);
    expect(mutation?.bindingMutations).toEqual([{
      operation: 'create',
      templateId: 'binding:0',
      input: 'MWHEELUP',
      context: 1,
    }]);

    apex.set_game_binding_slot('binding:0', 'binding:0', '', 0);
    mutation = buildApexGameSettingsMutation(apex);
    expect(mutation?.bindingMutations).toEqual([
      {operation: 'delete', id: 'binding:0'},
      {operation: 'create', templateId: 'binding:0', input: 'MWHEELUP', context: 1},
    ]);
  });

  it('rejects setting and binding edits while a write is in progress', () => {
    const apex = useApexStore();
    adoptApexGameSettingsReport(apex, {
      ...gameSettingsReport('1'),
      bindings: [{
        id: 'binding:0',
        input: 'W',
        command: '+forward',
        context: 0,
        heldCommand: null,
        editable: true,
        occurrence: 0,
      }],
    });
    apex.is_game_settings_saving = true;

    apex.set_game_setting_value('settings', 'mouse_sensitivity', '2');
    apex.set_game_binding_slot('binding:0', 'binding:0', 'S', 0);

    expect(apex.game_settings_values.settings.mouse_sensitivity).toBe('1');
    expect(apex.game_settings_bindings[0].input).toBe('W');
  });
});

describe('Apex binding input takeover', () => {
  function setupBindings() {
    const apex = useApexStore();
    adoptApexGameSettingsReport(apex, {
      ...gameSettingsReport('1'),
      bindings: [
        {id: 'jump', input: 'SPACE', command: '+jump', context: 0, heldCommand: null, editable: true, occurrence: 0},
        {id: 'weapon', input: '2', command: 'weaponSelectSecondary', context: 0, heldCommand: null, editable: true, occurrence: 0},
        {id: 'weapon-alt', input: 'x', command: 'weaponSelectSecondary', context: 1, heldCommand: null, editable: true, occurrence: 0},
      ],
    });
    return apex;
  }

  it('takes over key 2 and submits the old binding deletion with the new assignment', () => {
    const apex = setupBindings();
    apex.set_game_binding_slot('jump', 'jump', '2', 0);
    expect(apex.game_settings_bindings.map(binding => binding.input)).toEqual(['2', '', 'x']);
    expect(buildApexGameSettingsMutation(apex)?.bindingMutations).toEqual([
      {operation: 'update', id: 'jump', input: '2'},
      {operation: 'delete', id: 'weapon'},
    ]);
  });

  it('takes over a secondary slot case-insensitively when adding a new slot', () => {
    const apex = setupBindings();
    apex.set_game_binding_slot('jump', null, 'X', 1);
    expect(apex.game_settings_bindings.map(binding => binding.input)).toEqual(['SPACE', '2', '', 'X']);
    expect(buildApexGameSettingsMutation(apex)?.bindingMutations).toEqual([
      {operation: 'delete', id: 'weapon-alt'},
      {operation: 'create', templateId: 'jump', input: 'X', context: 1},
    ]);
  });

  it('transfers an unapplied draft without creating two bindings for the same input', () => {
    const apex = setupBindings();
    apex.set_game_binding_slot('jump', null, 'MOUSE4', 1);
    apex.set_game_binding_slot('weapon', 'weapon', 'mouse4', 0);
    expect(buildApexGameSettingsMutation(apex)?.bindingMutations).toEqual([
      {operation: 'update', id: 'weapon', input: 'mouse4'},
    ]);
  });

  it('moves an input between slots of the same action', () => {
    const apex = setupBindings();
    apex.set_game_binding_slot('jump', null, 'SPACE', 1);
    expect(buildApexGameSettingsMutation(apex)?.bindingMutations).toEqual([
      {operation: 'delete', id: 'jump'},
      {operation: 'create', templateId: 'jump', input: 'SPACE', context: 1},
    ]);
  });

  it('keeps protected bindings and invalid edit targets unchanged', () => {
    const apex = setupBindings();
    apex.game_settings_bindings[1].editable = false;
    apex.set_game_binding_slot('jump', 'jump', '2', 0);
    apex.set_game_binding_slot('missing', null, 'x', 1);
    expect(apex.game_settings_bindings.map(binding => binding.input)).toEqual(['SPACE', '2', 'x']);
    expect(buildApexGameSettingsMutation(apex)?.bindingMutations).toEqual([]);
  });
});
