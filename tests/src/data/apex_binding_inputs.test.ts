import {describe, expect, it} from 'vitest';
import {
  APEX_BINDING_BY_KEYBOARD_CODE,
} from '@/data/apex_binding_inputs.ts';
import {
  apexBindingFromKeyboardCode,
  apexBindingFromMouseButton,
  apexBindingFromWheelDelta,
} from '@/utils/game/apex_game_settings.ts';

describe('Apex input catalog', () => {
  it('uses the shared config-name mapping for every supported special key', () => {
    for (const [code, input] of Object.entries(APEX_BINDING_BY_KEYBOARD_CODE)) {
      expect(apexBindingFromKeyboardCode(code)).toBe(input);
    }
    expect(apexBindingFromKeyboardCode('KeyW')).toBe('w');
    expect(apexBindingFromKeyboardCode('Digit0')).toBe('0');
    expect(apexBindingFromKeyboardCode('ShiftRight')).toBe('RSHIFT');
    expect(apexBindingFromKeyboardCode('Numpad7')).toBe('KP_HOME');
    expect(apexBindingFromKeyboardCode('Numpad0')).toBe('KP_INS');
    expect(apexBindingFromKeyboardCode('NumpadEnter')).toBe('KP_ENTER');
    expect(apexBindingFromKeyboardCode('NumLock')).toBe('NUMLOCK');
    expect(apexBindingFromKeyboardCode('ScrollLock')).toBe('SCROLLLOCK');
    expect(apexBindingFromKeyboardCode('F12')).toBe('F12');
    expect(apexBindingFromKeyboardCode('F13')).toBeNull();
    expect(apexBindingFromKeyboardCode('BracketLeft')).toBe('[[');
    expect(apexBindingFromKeyboardCode('Semicolon')).toBe('SEMICOLON');
    expect(apexBindingFromKeyboardCode('MetaLeft')).toBeNull();
  });

  it('keeps DOM middle/secondary/side button numbering separate from Apex numbering', () => {
    expect([0, 1, 2, 3, 4, 5].map(apexBindingFromMouseButton))
      .toEqual(['MOUSE1', 'MOUSE3', 'MOUSE2', 'MOUSE4', 'MOUSE5', null]);
    expect(apexBindingFromWheelDelta(-1)).toBe('MWHEELUP');
    expect(apexBindingFromWheelDelta(1)).toBe('MWHEELDOWN');
    expect(apexBindingFromWheelDelta(0)).toBeNull();
  });
});
