import {readFileSync} from 'node:fs';
import {beforeEach, describe, expect, it} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import {QUICK_PRESET_AIM_MOUSE_RIGHT_KEY} from '@/data/presets/apex_quick_preset.ts';
import {buildApexGameSettingsMutation} from '@/stores/game/apex/actions_settings.ts';
import {initGameSettingOptionsForDialog} from '@/utils/game/apex_quick_preset.ts';
import type {ApexBinding} from '@/types/apex_game_settings.ts';
import {gameOnlyPreset, presetStore, quickPresetScreen} from './quick_preset_test_helpers.ts';

function binding(id: string, input: string, command: string, context = 0): ApexBinding {
  return {id, input, command, context, heldCommand: null, editable: true, occurrence: 0};
}

const holdAim = gameOnlyPreset({[QUICK_PRESET_AIM_MOUSE_RIGHT_KEY]: true});

beforeEach(() => setActivePinia(createPinia()));

describe('Apex quick preset right-mouse hold aim', () => {
  it('leaves the toggle-aim reset default unchecked', () => {
    const resetSettings = readFileSync(new URL(
      '../../../../../src-tauri/src/game/apex_defaults/settings.cfg', import.meta.url,
    ), 'utf8');
    expect(resetSettings).toMatch(/^bind_US_standard "MOUSE2" "\+toggle_zoom" 0\r?$/m);
    const options = initGameSettingOptionsForDialog({}, [binding('toggle', 'MOUSE2', '+toggle_zoom')]);
    expect(options[QUICK_PRESET_AIM_MOUSE_RIGHT_KEY]).toBe(false);
  });

  it.each([0, 1])('recognizes hold aim in context %s, including a held companion', context => {
    const aim = {...binding('hold', 'mouse2', '+ZOOM', context), heldCommand: '+zoom_held'};
    expect(initGameSettingOptionsForDialog({}, [aim])[QUICK_PRESET_AIM_MOUSE_RIGHT_KEY]).toBe(true);
  });

  it('replaces default toggle aim with an explicit hold command across repeated preparation', () => {
    const original = [
      binding('toggle', 'MOUSE2', '+toggle_zoom'),
      binding('other-toggle', 'v', '+toggle_zoom', 1),
      binding('ping', 'MOUSE3', '+ping'),
      binding('tactical', 'MOUSE4', '+offhand1', 1),
      binding('ultimate', 'MOUSE5', '+offhand4', 1),
    ];
    const store = presetStore({}, original);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      store.prepare_quick_preset(quickPresetScreen, holdAim);
      const active = store.game_settings_bindings.filter(item => item.input);
      const rightMouse = active.filter(item => item.input.toUpperCase() === 'MOUSE2');
      expect(rightMouse).toHaveLength(1);
      expect(rightMouse[0]).toMatchObject({command: '+zoom', context: 0});
      expect(active.filter(item => item.input !== 'MOUSE2')).toEqual(original.slice(1));
      expect(buildApexGameSettingsMutation(store)?.bindingMutations).toEqual([
        {operation: 'delete', id: 'toggle'},
        {operation: 'createCommand', command: '+zoom', input: 'MOUSE2', context: 0},
      ]);
      expect(initGameSettingOptionsForDialog({}, active)[QUICK_PRESET_AIM_MOUSE_RIGHT_KEY]).toBe(true);
    }
  });

  it('reuses an existing hold template and keeps its other slot and held companion', () => {
    const original = [
      binding('toggle', 'MOUSE2', '+toggle_zoom'),
      {...binding('hold', 'v', '+zoom'), heldCommand: '+zoom_held'},
    ];
    const store = presetStore({}, original);
    store.prepare_quick_preset(quickPresetScreen, holdAim);

    expect(buildApexGameSettingsMutation(store)?.bindingMutations).toEqual([
      {operation: 'delete', id: 'toggle'},
      {operation: 'create', templateId: 'hold', input: 'MOUSE2', context: 1},
    ]);
    const active = store.game_settings_bindings.filter(item => item.input);
    expect(active.find(item => item.id === 'hold')).toEqual(original[1]);
    expect(active.find(item => item.input === 'MOUSE2')).toMatchObject({
      command: '+zoom', heldCommand: '+zoom_held', context: 1,
    });
  });

  it('replaces one occupied hold slot without creating a third slot', () => {
    const store = presetStore({}, [
      binding('toggle', 'MOUSE2', '+toggle_zoom'),
      binding('hold-primary', 'v', '+zoom'),
      binding('hold-secondary', 'b', '+zoom', 1),
    ]);
    store.prepare_quick_preset(quickPresetScreen, holdAim);

    const active = store.game_settings_bindings.filter(item => item.input);
    expect(active).toHaveLength(2);
    expect(active.find(item => item.input === 'MOUSE2')).toMatchObject({command: '+zoom', context: 0});
    expect(active.find(item => item.input === 'b')).toMatchObject({command: '+zoom', context: 1});
  });

  it('keeps toggle aim untouched when the preset is unchecked', () => {
    const original = [binding('toggle', 'MOUSE2', '+toggle_zoom')];
    const store = presetStore({}, original);
    store.prepare_quick_preset(quickPresetScreen, gameOnlyPreset({[QUICK_PRESET_AIM_MOUSE_RIGHT_KEY]: false}));

    expect(store.game_settings_bindings).toEqual(original);
    expect(buildApexGameSettingsMutation(store)?.bindingMutations).toEqual([]);
  });

  it('uses an explicit hold command when a missing file has no binding template', () => {
    const store = presetStore({});
    store.game_settings_report!.settings.exists = false;
    store.prepare_quick_preset(quickPresetScreen, holdAim);

    expect(buildApexGameSettingsMutation(store)?.bindingMutations).toEqual([
      {operation: 'createCommand', command: '+zoom', input: 'MOUSE2', context: 0},
    ]);
  });
});
