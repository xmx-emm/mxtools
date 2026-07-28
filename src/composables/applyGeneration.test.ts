import {describe, expect, it} from 'vitest';
import {nextGeneration, shouldRunApply} from './applyGeneration.ts';

describe('applyGeneration', () => {
  it('nextGeneration increments', () => {
    expect(nextGeneration(0)).toBe(1);
    expect(nextGeneration(3)).toBe(4);
  });

  it('shouldRunApply requires matching generation and running flag', () => {
    expect(
      shouldRunApply({
        currentGeneration: 2,
        expectedGeneration: 2,
        isApplyRunning: true,
      }),
    ).toBe(true);
    expect(
      shouldRunApply({
        currentGeneration: 3,
        expectedGeneration: 2,
        isApplyRunning: true,
      }),
    ).toBe(false);
    expect(
      shouldRunApply({
        currentGeneration: 2,
        expectedGeneration: 2,
        isApplyRunning: false,
      }),
    ).toBe(false);
  });
});
