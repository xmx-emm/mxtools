import fs from 'fs';
import path from 'path';

const root = process.cwd();
const conf = JSON.parse(
  fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'),
);
const { productName, version } = conf;
const releaseDir = path.join(root, 'src-tauri/target/release');
const nsisDir = path.join(releaseDir, 'bundle/nsis');

const portableSrc = path.join(releaseDir, `${productName}.exe`);
const portableDest = path.join(releaseDir, `萌新工具箱 ${version} 便携版.exe`);
const installerSrc = path.join(nsisDir, `${productName}_${version}_x64-setup.exe`);
const installerDest = path.join(nsisDir, `萌新工具箱 ${version} 安装版.exe`);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function copyArtifact(src, dest, label) {
  if (!fs.existsSync(src)) {
    console.error(`未找到${label}构建产物: ${src}`);
    process.exit(1);
  }

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      fs.writeFileSync(dest, fs.readFileSync(src));
      const sizeMb = (fs.statSync(dest).size / 1024 / 1024).toFixed(2);
      console.log(`${label}已生成 (${sizeMb} MB): ${dest}`);
      return;
    } catch (error) {
      if (error?.code !== 'EBUSY' || attempt === 10) throw error;
      await sleep(500);
    }
  }
}

await copyArtifact(portableSrc, portableDest, '便携版');
await copyArtifact(installerSrc, installerDest, '安装版');
