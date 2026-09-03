import {describe, expect, it} from 'vitest';
import {
  QUICK_PRESET_AIM_MOUSE_RIGHT_KEY,
  QUICK_PRESET_FORWARD_WHEEL_UP_KEY,
  QUICK_PRESET_JUMP_WHEEL_DOWN_KEY,
  quickPresetGameSettingToggles,
  quickPresetLaunchOptionToggles,
  quickPresetVideoConfigToggles,
} from '@/data/presets/apex_quick_preset.ts';
import {
  findLaunchOptionRef,
  initGameSettingOptionsForDialog,
  initLaunchOptionsForDialog,
  initVideoOptionsForDialog,
} from '@/utils/game/apex_quick_preset.ts';
import type {ApexBinding} from '@/types/apex_game_settings.ts';

function binding(
  id: string,
  input: string,
  command: string,
  context = 0,
): ApexBinding {
  return {id, input, command, context, editable: true, occurrence: 0};
}

describe('Apex quick preset initial selection', () => {
  it('treats successfully read empty launch and video configs as all unchecked', () => {
    expect(initLaunchOptionsForDialog([])).toEqual(Object.fromEntries(
      quickPresetLaunchOptionToggles.map(toggle => [toggle.key, false]),
    ));
    expect(initVideoOptionsForDialog({})).toEqual(Object.fromEntries(
      quickPresetVideoConfigToggles.map(toggle => [toggle.key, false]),
    ));
  });

  it('checks only launch and video options that match the current config', () => {
    const launchToggle = quickPresetLaunchOptionToggles[0]!;
    const launchOption = findLaunchOptionRef(launchToggle)!;
    const launchSelection = initLaunchOptionsForDialog([launchOption]);
    expect(launchSelection[launchToggle.key]).toBe(true);
    expect(Object.values(launchSelection).filter(Boolean)).toHaveLength(1);

    const videoToggle = quickPresetVideoConfigToggles.find(
      toggle => Object.keys(toggle.onValues).length > 1,
    )!;
    const completeValues = {...videoToggle.onValues};
    expect(initVideoOptionsForDialog(completeValues)[videoToggle.key]).toBe(true);
    delete completeValues[Object.keys(completeValues)[0]!];
    expect(initVideoOptionsForDialog(completeValues)[videoToggle.key]).toBe(false);
  });

  it('checks profile optimizations only when their current values match', () => {
    const profile = Object.fromEntries(
      quickPresetGameSettingToggles.map(([, key, value]) => [key, value]),
    );
    const first = quickPresetGameSettingToggles[0]!;
    profile[first[1]] = first[2] === '0' ? '1' : '0';

    const options = initGameSettingOptionsForDialog(profile, []);

    expect(options[first[0]]).toBe(false);
    for (const [id] of quickPresetGameSettingToggles.slice(1)) {
      expect(options[id]).toBe(true);
    }
  });

  it('detects the three binding optimizations independently and rejects conflicts', () => {
    const bindings = [
      binding('aim', 'mouse2', '+toggle_zoom'),
      binding('forward', 'MWHEELUP', '+forward', 1),
      binding('jump', 'MWHEELDOWN', '+jump', 1),
    ];
    const selected = initGameSettingOptionsForDialog({}, bindings);
    expect(selected[QUICK_PRESET_AIM_MOUSE_RIGHT_KEY]).toBe(true);
    expect(selected[QUICK_PRESET_FORWARD_WHEEL_UP_KEY]).toBe(true);
    expect(selected[QUICK_PRESET_JUMP_WHEEL_DOWN_KEY]).toBe(true);

    const conflicted = initGameSettingOptionsForDialog({}, [
      ...bindings,
      binding('attack', 'MOUSE2', '+attack'),
    ]);
    expect(conflicted[QUICK_PRESET_AIM_MOUSE_RIGHT_KEY]).toBe(false);
    expect(conflicted[QUICK_PRESET_FORWARD_WHEEL_UP_KEY]).toBe(true);
    expect(conflicted[QUICK_PRESET_JUMP_WHEEL_DOWN_KEY]).toBe(true);
  });

});
