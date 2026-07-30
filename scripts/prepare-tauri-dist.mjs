import {copyFile, mkdir, rm, stat} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (index >= 0 && (!value || value.startsWith('--'))) {
    throw new Error(`Missing path after ${name}`);
  }
  return value;
}

const root = process.cwd();
const distDir = path.resolve(root, argumentValue('--dist') ?? 'dist');
const reportSource = path.join(distDir, 'bundle-report.json');
const reportDestination = path.resolve(
  root,
  argumentValue('--report-out') ?? 'src-tauri/target/bundle-report.json',
);

async function fileSize(file) {
  try {
    return (await stat(file)).size;
  } catch (error) {
    if (error?.code === 'ENOENT') return 0;
    throw error;
  }
}

const manifestPath = path.join(distDir, '.vite', 'manifest.json');
const removedBytes = await fileSize(reportSource) + await fileSize(manifestPath);

await mkdir(path.dirname(reportDestination), {recursive: true});
await copyFile(reportSource, reportDestination);
await Promise.all([
  rm(reportSource, {force: true}),
  rm(path.join(distDir, '.vite'), {recursive: true, force: true}),
]);

console.log(`Bundle report preserved outside frontend assets: ${reportDestination}`);
console.log(`Removed ${removedBytes} bytes of build-only metadata from ${distDir}`);
