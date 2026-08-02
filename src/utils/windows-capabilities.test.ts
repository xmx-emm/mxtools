import {describe, expect, it} from 'vitest';
import permissions from '../../src-tauri/capabilities/permissions.json';

describe('auxiliary window capabilities', () => {
  it('allows the Apex quick-preset window to initialize and use its title bar', () => {
    expect(permissions.windows).toContain('apex-quick-preset-window');
  });
});
