import {describe, expect, it} from 'vitest';
import {accentThemes, DEFAULT_ACCENT, findAccent} from '@/themes.ts';

describe('accent themes', () => {
  it('uses APEX red as the default accent and fallback', () => {
    expect(DEFAULT_ACCENT).toBe('apex-red');
    expect(accentThemes.some(theme => theme.id === DEFAULT_ACCENT)).toBe(true);
    expect(findAccent('unknown-accent').id).toBe(DEFAULT_ACCENT);
  });
});
