import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (index >= 0 && (!value || value.startsWith('--'))) {
    throw new Error(`Missing value after ${name}`);
  }
  return value;
}

const root = process.cwd();
const conf = JSON.parse(await readFile(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const versionDir = path.join(root, 'src-tauri', 'target', 'release', conf.version);
const limit = Number(argumentValue('--limit') ?? 5_000_000);
const artifacts = [
  ['便携版', path.resolve(root, argumentValue('--portable') ?? path.join(versionDir, `萌新工具箱 ${conf.version} 便携版.exe`)), limit],
  ['安装版', path.resolve(root, argumentValue('--installer') ?? path.join(versionDir, `萌新工具箱 ${conf.version} 安装版.exe`)), limit],
  ['微软商店版', path.resolve(root, argumentValue('--store') ?? path.join(versionDir, `萌新工具箱 ${conf.version} 微软商店版.exe`)), null],
];

if (!Number.isSafeInteger(limit) || limit <= 0) {
  throw new Error(`Invalid byte limit: ${limit}`);
}

const failures = [];
for (const [label, artifact, artifactLimit] of artifacts) {
  try {
    const bytes = (await stat(artifact)).size;
    if (artifactLimit === null) {
      console.log(`${label}: ${bytes} bytes (offline WebView2; no compact-build limit)`);
    } else {
      console.log(`${label}: ${bytes} bytes (limit: < ${artifactLimit})`);
      if (bytes >= artifactLimit) failures.push(`${label} is ${bytes - artifactLimit + 1} bytes over the strict limit`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    failures.push(`${label} is missing: ${artifact}`);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`Release size budget failed: ${failure}`);
  process.exitCode = 1;
}
