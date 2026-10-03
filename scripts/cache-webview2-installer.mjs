import {access, mkdir, rename, rm, stat} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {spawn} from 'node:child_process';

const root = process.cwd();
const tauriDir = path.join(root, 'src-tauri');
const cacheDir = path.join(tauriDir, 'target', 'webview2');
const installer = process.env.MXTOOLS_WEBVIEW2_OFFLINE_INSTALLER
  ? path.resolve(root, process.env.MXTOOLS_WEBVIEW2_OFFLINE_INSTALLER)
  : path.join(cacheDir, 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe');
const partial = `${installer}.part`;
const installerUrl = 'https://go.microsoft.com/fwlink/?linkid=2124701';
const minimumBytes = 50_000_000;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd: root, stdio: 'inherit', windowsHide: true});
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}

async function reusable() {
  try {
    const file = await stat(installer);
    return file.isFile() && file.size >= minimumBytes;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

if (await reusable()) {
  console.log(`复用已缓存的 WebView2 离线安装器: ${installer}`);
} else {
  if (process.platform !== 'win32') throw new Error('微软商店版目前只能在 Windows 上构建');
  await mkdir(path.dirname(installer), {recursive: true});
  await rm(partial, {force: true});
  console.log(`下载 WebView2 离线安装器: ${installerUrl}`);
  await run('curl.exe', [
    '--location', '--fail', '--show-error', '--retry', '3', '--retry-all-errors',
    '--output', partial, installerUrl,
  ]);
  const bytes = (await stat(partial)).size;
  if (bytes < minimumBytes) {
    await rm(partial, {force: true});
    throw new Error(`WebView2 离线安装器异常小，仅 ${bytes} bytes`);
  }
  await access(partial);
  await rm(installer, {force: true});
  await rename(partial, installer);
  console.log(`WebView2 离线安装器已缓存 (${bytes} bytes): ${installer}`);
}
