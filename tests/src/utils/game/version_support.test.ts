import {describe, expect, it} from 'vitest';
import {gameVersionStatus, verifiedGameBuilds} from '@/utils/game/version_support.ts';

describe('Game compatibility uses exact verified builds', () => {
  it('does not infer compatibility from a matching short version', () => {
    expect(gameVersionStatus('apex', {installed: true, version: 'v3.0.4.57', build: verifiedGameBuilds.apex[0]})).toBe('verified');
    expect(gameVersionStatus('apex', {installed: true, version: 'v3.0.4.57', build: 'new-build'})).toBe('unverified');
  });
  it('keeps missing evidence distinct from unsupported installations', () => {
    expect(gameVersionStatus('apex', null)).toBe('unknown');
    expect(gameVersionStatus('apex', {installed: false, version: null, build: null})).toBe('notInstalled');
    expect(gameVersionStatus('apex', {installed: true, version: 'v3.0.4.57', build: null})).toBe('unknown');
    expect(gameVersionStatus('pubg', {installed: true, version: null, build: '25049128'})).toBe('unverified');
  });
});
