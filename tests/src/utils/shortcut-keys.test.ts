import {describe, expect, it} from 'vitest';
import {
  isValidAppAccelerator,
  isValidGlobalAccelerator,
} from '@/utils/shortcut-keys.ts';

describe('shortcut key validation', () => {
  it('allows a single key for an in-app shortcut', () => {
    expect(isValidAppAccelerator('Z')).toBe(true);
    expect(isValidAppAccelerator('F8')).toBe(true);
    expect(isValidAppAccelerator('Ctrl+Alt+Shift+Z')).toBe(true);
  });

  it('retains the modifier requirement for global shortcuts', () => {
    expect(isValidGlobalAccelerator('Z')).toBe(false);
    expect(isValidGlobalAccelerator('Ctrl+Z')).toBe(true);
  });
});
