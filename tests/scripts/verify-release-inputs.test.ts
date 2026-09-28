import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  cargoPackageVersion,
  collectVersionErrors,
  windowsToolPath,
} from '../../scripts/verify-release-inputs.mjs';

describe('release input verification', () => {
  it('reads the package version and local dependency from Cargo.toml', () => {
    const source = `[package]\nname = "mxtools"\nversion = "0.0.8"\n\n[dependencies]\nwindows_tool = { path = "../../../rust/windows_tool" }\n`;
    expect(cargoPackageVersion(source)).toBe('0.0.8');
    expect(windowsToolPath(source, path.resolve('C:/work/tauri/mxtools/src-tauri')))
      .toBe(path.resolve('C:/work/rust/windows_tool'));
  });

  it('rejects missing, malformed, or mismatched versions', () => {
    expect(collectVersionErrors('0.0.8', '0.0.8', '0.0.8')).toEqual([]);
    expect(collectVersionErrors('0.0.8', '0.0.7', 'next')).toEqual(expect.arrayContaining([
      expect.stringContaining('tauri version is invalid'),
      expect.stringContaining('release versions differ'),
    ]));
  });
});
