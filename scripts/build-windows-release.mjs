import {access, copyFile, mkdir, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {spawn} from 'node:child_process';

const root = process.cwd();
const tauriDir = path.join(root, 'src-tauri');
const releaseDir = path.join(tauriDir, 'target', 'release');
const conf = JSON.parse(await readFile(path.join(tauriDir, 'tauri.conf.json'), 'utf8'));
const releaseBinary = path.join(releaseDir, `${conf.productName}.exe`);
const releaseBinarySnapshot = path.join(releaseDir, `${conf.productName}.unbundled.exe`);
const tauriCli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: {...process.env, ...options.env},
      stdio: 'inherit',
      windowsHide: true,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(
        `${path.basename(command)} exited with ${signal ? `signal ${signal}` : `code ${code}`}`,
      ));
    });
  });
}

function runNode(script, args = []) {
  return run(process.execPath, [path.join(root, script), ...args]);
}

function runTauri(args, env = {}) {
  return run(process.execPath, [tauriCli, ...args], {env});
}

async function copyWithRetry(source, destination, attempts = 10) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await copyFile(source, destination);
      return;
    } catch (error) {
      lastError = error;
      if (!['EBUSY', 'EPERM', 'EACCES'].includes(error?.code) || attempt === attempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError;
}

async function saveReleaseBinary() {
  await access(releaseBinary);
  await rm(releaseBinarySnapshot, {force: true});
  await copyWithRetry(releaseBinary, releaseBinarySnapshot);
}

async function restoreReleaseBinary() {
  try {
    await access(releaseBinarySnapshot);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  await copyWithRetry(releaseBinarySnapshot, releaseBinary);
}

const signedUpdater = Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY);
if (!signedUpdater || !conf.plugins?.updater?.pubkey?.trim()) {
  throw new Error('Release builds require TAURI_SIGNING_PRIVATE_KEY and the committed updater public key');
}
await runNode('scripts/verify-release-inputs.mjs');
await runTauri(['build', '--no-bundle']);
await saveReleaseBinary();

try {
  await runTauri(['bundle', '--bundles', 'nsis', ...(signedUpdater
    ? ['--config', JSON.stringify({bundle: {createUpdaterArtifacts: true}})] : [])]);
  await restoreReleaseBinary();
  await runNode('scripts/build-portable-sfx.mjs');
  await runTauri(['signer', 'sign', path.join(releaseDir, 'bundle/nsis', `${conf.productName}_${conf.version}_x64-portable.exe`)]);
  await runNode('scripts/rename-release-builds.mjs');
  if (signedUpdater) await runNode('scripts/updater-manifest.mjs');
  await runNode('scripts/release-size-budget.mjs');
  const publishDir = path.join(releaseDir, conf.version, 'publish');
  await mkdir(publishDir, {recursive: true});
  for (const [source, target] of [
    ['安装版', 'setup'], ['便携版', 'portable'],
  ]) {
    await copyFile(path.join(releaseDir, conf.version, `萌新工具箱 ${conf.version} ${source}.exe`),
      path.join(publishDir, `MxTools_${conf.version}_x64_${target}.exe`));
  }
  for (const name of [`MxTools_${conf.version}_x64_setup.exe.sig`, `MxTools_${conf.version}_x64_portable.exe.sig`, 'latest.json']) {
    await copyFile(path.join(releaseDir, conf.version, 'updater', name), path.join(publishDir, name));
  }
} finally {
  await restoreReleaseBinary();
  await rm(releaseBinarySnapshot, {force: true});
}
