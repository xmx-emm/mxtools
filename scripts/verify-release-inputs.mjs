import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

export const WINDOWS_TOOL_REVISION = '63be28c24cc093a8d160d902cb983331dc9c9e2e';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const TAURI_DIR = path.join(ROOT, 'src-tauri');

export function cargoPackageVersion(source) {
  const packageSection = source.match(/\[package\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? '';
  return packageSection.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? null;
}

export function windowsToolPath(source, tauriDirectory = TAURI_DIR) {
  const relative = source.match(/windows_tool\s*=\s*\{[^}]*\bpath\s*=\s*"([^"]+)"/)?.[1];
  return relative ? path.resolve(tauriDirectory, relative) : null;
}

export function collectVersionErrors(packageVersion, cargoVersion, tauriVersion) {
  const versions = {package: packageVersion, cargo: cargoVersion, tauri: tauriVersion};
  const errors = Object.entries(versions)
    .filter(([, value]) => !/^\d+\.\d+\.\d+$/.test(value ?? ''))
    .map(([name, value]) => `${name} version is invalid: ${value ?? 'missing'}`);
  if (new Set(Object.values(versions)).size !== 1) {
    errors.push(`release versions differ: ${JSON.stringify(versions)}`);
  }
  return errors;
}

function git(directory, args) {
  return execFileSync('git', ['-C', directory, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

export async function verifyReleaseInputs() {
  const [packageSource, cargoSource, tauriSource] = await Promise.all([
    readFile(path.join(ROOT, 'package.json'), 'utf8'),
    readFile(path.join(TAURI_DIR, 'Cargo.toml'), 'utf8'),
    readFile(path.join(TAURI_DIR, 'tauri.conf.json'), 'utf8'),
  ]);
  const packageVersion = JSON.parse(packageSource).version;
  const cargoVersion = cargoPackageVersion(cargoSource);
  const tauriVersion = JSON.parse(tauriSource).version;
  const errors = collectVersionErrors(packageVersion, cargoVersion, tauriVersion);

  const dependencyPath = windowsToolPath(cargoSource);
  if (!dependencyPath) {
    errors.push('windows_tool path dependency is missing from Cargo.toml');
  } else {
    try {
      const revision = git(dependencyPath, ['rev-parse', 'HEAD']);
      if (revision !== WINDOWS_TOOL_REVISION) {
        errors.push(`windows_tool revision is ${revision}; expected ${WINDOWS_TOOL_REVISION}`);
      }
      const status = git(dependencyPath, ['status', '--porcelain', '--untracked-files=all']);
      if (status) {
        errors.push(`windows_tool worktree is not clean:\n${status}`);
      }
    } catch (error) {
      errors.push(`cannot inspect windows_tool at ${dependencyPath}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Release input verification failed:\n- ${errors.join('\n- ')}`);
  }
  console.log(`Release inputs verified for ${packageVersion}; windows_tool ${WINDOWS_TOOL_REVISION}`);
  return {version: packageVersion, dependencyPath};
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  verifyReleaseInputs().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
