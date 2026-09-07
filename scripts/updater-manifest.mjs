import {readFile, writeFile, copyFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function makeUpdaterManifest(version, signature, notes = '') {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('A stable semantic version is required');
  if (!signature.trim() || !/^[A-Za-z0-9+/=\s]+$/.test(signature)) throw new Error('Missing updater signature');
  return {
    version, notes, pub_date: new Date().toISOString(),
    platforms: {'windows-x86_64': {
      signature: signature.trim(),
      url: `https://github.com/xmx-emm/mxtools/releases/download/v${version}/mxtools_${version}_x64-setup.exe`,
    }},
  };
}

export async function prepareUpdaterArtifacts(root = process.cwd()) {
  const config = JSON.parse(await readFile(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  const name = `mxtools_${config.version}_x64-setup.exe`;
  const source = path.join(root, 'src-tauri/target/release/bundle/nsis', name);
  const signature = await readFile(source + '.sig', 'utf8');
  const output = path.join(root, 'src-tauri/target/release', config.version, 'updater');
  await mkdir(output, {recursive: true});
  await copyFile(source, path.join(output, name));
  await copyFile(source + '.sig', path.join(output, name + '.sig'));
  await writeFile(path.join(output, 'latest.json'), JSON.stringify(
    makeUpdaterManifest(config.version, signature, process.env.MXTOOLS_UPDATE_NOTES || ''), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareUpdaterArtifacts();
}
