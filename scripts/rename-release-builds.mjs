import fs from 'fs';
import path from 'path';

const root = process.cwd();
const conf = JSON.parse(
  fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'),
);
const { productName, version } = conf;
const releaseDir = path.join(root, 'src-tauri/target/release');
const nsisDir = path.join(releaseDir, 'bundle/nsis');
const versionDir = path.join(releaseDir, version);

const portableSrc = path.join(releaseDir, `${productName}.exe`);
const installerSrc = path.join(nsisDir, `${productName}_${version}_x64-setup.exe`);
const portableDest = path.join(versionDir, `萌新工具箱 ${version} 便携版.exe`);
const installerDest = path.join(versionDir, `萌新工具箱 ${version} 安装版.exe`);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBusyError(error) {
  return error?.code === 'EBUSY' || error?.code === 'EPERM' || error?.code === 'EACCES';
}

function printBusyHint(busyPath) {
  console.error('');
  console.error('────────────────────────────────────────');
  console.error('重命名发布产物失败：目标文件正被占用');
  console.error('────────────────────────────────────────');
  if (busyPath) {
    console.error(`占用文件: ${busyPath}`);
  }
  console.error('');
  console.error('请先关闭正在运行的「萌新工具箱 / mxtools」，再执行：');
  console.error('  npm run "build window release"');
  console.error('或只重跑重命名：');
  console.error('  node scripts/rename-release-builds.mjs');
  console.error('');
  console.error('Tauri 构建本身已成功，原始产物仍可直接使用：');
  if (fs.existsSync(portableSrc)) {
    console.error(`  便携版: ${portableSrc}`);
  }
  if (fs.existsSync(installerSrc)) {
    console.error(`  安装版: ${installerSrc}`);
  }
  console.error('────────────────────────────────────────');
}

async function rmWithRetry(target, attempts = 10) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (!fs.existsSync(target)) return;
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!isBusyError(error) || attempt === attempts) throw error;
      await sleep(500);
    }
  }
}

async function prepareVersionDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`已创建版本目录: ${dir}`);
    return;
  }

  for (const entry of fs.readdirSync(dir)) {
    const target = path.join(dir, entry);
    try {
      await rmWithRetry(target);
    } catch (error) {
      if (isBusyError(error)) {
        error.busyPath = target;
      }
      throw error;
    }
  }
  console.log(`已清空版本目录: ${dir}`);
}

async function copyArtifact(src, dest, label) {
  if (!fs.existsSync(src)) {
    console.error(`未找到${label}构建产物: ${src}`);
    process.exit(1);
  }

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      fs.copyFileSync(src, dest);
      const sizeMb = (fs.statSync(dest).size / 1024 / 1024).toFixed(2);
      console.log(`${label}已生成 (${sizeMb} MB): ${dest}`);
      return;
    } catch (error) {
      if (!isBusyError(error) || attempt === 10) {
        if (isBusyError(error)) {
          error.busyPath = dest;
        }
        throw error;
      }
      await sleep(500);
    }
  }
}

try {
  await prepareVersionDir(versionDir);
  await copyArtifact(portableSrc, portableDest, '便携版');
  await copyArtifact(installerSrc, installerDest, '安装版');
} catch (error) {
  if (isBusyError(error)) {
    printBusyHint(error.busyPath || error.path);
    process.exit(1);
  }
  console.error('重命名发布产物失败:', error?.message || error);
  process.exit(1);
}
