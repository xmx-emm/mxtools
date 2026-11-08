// Builds the Microsoft Store MSIX package from the release executable.
//
//   npm run "build window msix"                 # build exe, then pack
//   npm run "build window msix" -- --skip-build # pack the existing exe
//
// Identity defaults to the reserved Partner Center product; override with
// MXTOOLS_MSIX_IDENTITY_NAME, MXTOOLS_MSIX_PUBLISHER and
// MXTOOLS_MSIX_PUBLISHER_DISPLAY_NAME (e.g. for a local sideload test).
// The package is left unsigned: the Store signs it on submission.
import {copyFile, mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {spawn} from 'node:child_process';
import {DEFAULT_IDENTITY, msixVersion, renderAppxManifest} from './msix-manifest.mjs';

const root = process.cwd();
const tauriDir = path.join(root, 'src-tauri');
const releaseDir = path.join(tauriDir, 'target', 'release');
const conf = JSON.parse(await readFile(path.join(tauriDir, 'tauri.conf.json'), 'utf8'));
const executable = `${conf.productName}.exe`;
const tauriCli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const skipBuild = process.argv.includes('--skip-build');

const identity = {
  name: process.env.MXTOOLS_MSIX_IDENTITY_NAME || DEFAULT_IDENTITY.name,
  publisher: process.env.MXTOOLS_MSIX_PUBLISHER || DEFAULT_IDENTITY.publisher,
  publisherDisplayName: process.env.MXTOOLS_MSIX_PUBLISHER_DISPLAY_NAME || DEFAULT_IDENTITY.publisherDisplayName,
};

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd: root, stdio: 'inherit', windowsHide: true});
    child.once('error', reject);
    child.once('exit', (code) => (code === 0
      ? resolve()
      : reject(new Error(`${path.basename(command)} exited with code ${code}`))));
  });
}

async function findMakeAppx() {
  const kits = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin');
  const versions = existsSync(kits)
    ? (await readdir(kits)).filter((name) => /^10\.\d+\.\d+\.\d+$/.test(name))
    : [];
  versions.sort((a, b) => {
    const left = a.split('.').map(Number);
    const right = b.split('.').map(Number);
    return right.reduce((order, part, index) => order || part - left[index], 0);
  });
  for (const version of versions) {
    const candidate = path.join(kits, version, 'x64', 'makeappx.exe');
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('makeappx.exe not found; install the Windows 10/11 SDK');
}

const makeAppx = await findMakeAppx();
if (!skipBuild) await run(process.execPath, [tauriCli, 'build', '--no-bundle']);

const outputDir = path.join(releaseDir, conf.version, 'msix');
const layoutDir = path.join(outputDir, 'layout');
await rm(layoutDir, {recursive: true, force: true});
await mkdir(path.join(layoutDir, 'Assets'), {recursive: true});

await copyFile(path.join(releaseDir, executable), path.join(layoutDir, executable));
for (const asset of ['StoreLogo.png', 'Square44x44Logo.png', 'Square150x150Logo.png']) {
  await copyFile(path.join(tauriDir, 'icons', asset), path.join(layoutDir, 'Assets', asset));
}
await writeFile(path.join(layoutDir, 'AppxManifest.xml'), renderAppxManifest({
  version: conf.version,
  executable,
  displayName: '萌新工具箱',
  description: 'Apex 与 PUBG 本地配置工作台',
  identity,
}));

const packagePath = path.join(outputDir, `MxTools_${msixVersion(conf.version)}_x64.msix`);
await rm(packagePath, {force: true});
await run(makeAppx, ['pack', '/o', '/h', 'SHA256', '/d', layoutDir, '/p', packagePath]);
console.log(`MSIX package: ${packagePath}`);
