import {access, copyFile, mkdir, readFile, rename, rm, stat} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {spawn} from 'node:child_process';

const root = process.cwd();
const tauriDir = path.join(root, 'src-tauri');
const releaseDir = path.join(tauriDir, 'target', 'release');
const conf = JSON.parse(await readFile(path.join(tauriDir, 'tauri.conf.json'), 'utf8'));
const releaseBinary = path.join(releaseDir, `${conf.productName}.exe`);
const releaseBinarySnapshot = path.join(releaseDir, `${conf.productName}.unbundled.exe`);
const webview2CacheDir = path.join(tauriDir, 'target', 'webview2');
const webview2Installer = path.join(
  webview2CacheDir,
  'MicrosoftEdgeWebView2RuntimeInstallerX64.exe',
);
const webview2InstallerPart = `${webview2Installer}.part`;
const webview2InstallerUrl = 'https://go.microsoft.com/fwlink/?linkid=2124701';
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

async function hasReusableWebview2Installer() {
  try {
    const file = await stat(webview2Installer);
    return file.isFile() && file.size >= 50_000_000;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function ensureWebview2Installer() {
  if (await hasReusableWebview2Installer()) {
    const bytes = (await stat(webview2Installer)).size;
    console.log(`复用已缓存的 WebView2 离线安装器 (${bytes} bytes): ${webview2Installer}`);
    return;
  }

  if (process.platform !== 'win32') {
    throw new Error('微软商店版目前只能在 Windows 上构建');
  }

  await mkdir(webview2CacheDir, {recursive: true});
  await rm(webview2InstallerPart, {force: true});
  console.log(`下载 WebView2 离线安装器: ${webview2InstallerUrl}`);
  await run('curl.exe', [
    '--location',
    '--fail',
    '--show-error',
    '--retry',
    '3',
    '--retry-all-errors',
    '--output',
    webview2InstallerPart,
    webview2InstallerUrl,
  ]);

  const bytes = (await stat(webview2InstallerPart)).size;
  if (bytes < 50_000_000) {
    await rm(webview2InstallerPart, {force: true});
    throw new Error(`WebView2 离线安装器异常小，仅 ${bytes} bytes`);
  }

  await rm(webview2Installer, {force: true});
  await rename(webview2InstallerPart, webview2Installer);
  console.log(`WebView2 离线安装器已缓存 (${bytes} bytes): ${webview2Installer}`);
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

await runTauri(['build', '--no-bundle']);
await saveReleaseBinary();

try {
  await runTauri(['bundle', '--bundles', 'nsis']);
  await restoreReleaseBinary();
  await runNode('scripts/build-portable-sfx.mjs');
  await runNode('scripts/rename-release-builds.mjs');

  await ensureWebview2Installer();
  await runTauri(
    [
      'bundle',
      '--bundles',
      'nsis',
      '--config',
      'src-tauri/tauri.microsoftstore.conf.json',
    ],
    {MXTOOLS_WEBVIEW2_OFFLINE_INSTALLER: webview2Installer},
  );
  await runNode('scripts/rename-release-builds.mjs', ['--store-only']);
  await runNode('scripts/release-size-budget.mjs');
} finally {
  await restoreReleaseBinary();
  await rm(releaseBinarySnapshot, {force: true});
}
