import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

const cargo = readFileSync(new URL('../../../src-tauri/Cargo.toml', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../../src-tauri/src/lib.rs', import.meta.url), 'utf8');
const frontend = readFileSync(new URL('../../../src/components/utils/AppVersion.vue', import.meta.url), 'utf8');
const developmentLauncher = readFileSync(new URL('../../../scripts/tauri-dev.mjs', import.meta.url), 'utf8');

describe('DevTools build gate', () => {
  it('keeps DevTools out of default release dependencies', () => {
    const tauriDependency = cargo.match(/^tauri = .*$/m)?.[0] ?? '';
    expect(tauriDependency).not.toContain('devtools');
    expect(cargo).toContain('devtools = ["tauri/devtools"]');
    expect(backend).toContain('#[cfg(not(feature = "devtools"))]');
  });

  it('enables the feature only in the development launcher and UI', () => {
    expect(developmentLauncher).toContain("'--features', 'devtools'");
    expect(frontend).toContain('if (!import.meta.env.DEV || !isTauriRuntime) return;');
  });
});
