import {Buffer} from 'node:buffer';
import {installerName} from './updater-manifest.mjs';

const API = 'https://gitee.com/api/v5/repos/mengxin_code/mxtools';
const RAW = 'https://gitee.com/mengxin_code/mxtools/raw/updates/latest.json';

export function domesticManifest(tag, verified) {
  const source = verified.get('latest.json');
  if (!source) return null; // Old unsigned releases still mirror normally.
  const manifest = JSON.parse(source.text);
  const version = tag.slice(1);
  const name = installerName(version);
  const installer = verified.get(name);
  const signature = verified.get(`${name}.sig`);
  const platform = manifest.platforms?.['windows-x86_64'];
  if (manifest.version !== version || Object.keys(manifest.platforms || {}).length !== 1
    || !installer || !signature?.text || !platform?.signature
    || platform.signature !== signature.text.trim()
    || platform.url !== `https://github.com/xmx-emm/mxtools/releases/download/${tag}/${name}`
    || installer.url !== `https://gitee.com/mengxin_code/mxtools/releases/download/${tag}/${name}`) {
    throw new Error('Signed manifest does not match verified installer and signature attachments');
  }
  return {...manifest, platforms: {'windows-x86_64': {...platform, url: installer.url}}};
}

export function compareVersions(a, b) {
  const parse = value => {
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error('Invalid manifest version');
    return value.split('.').map(BigInt);
  };
  const left = parse(a), right = parse(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}

export async function publishDomesticManifest(tag, verified, request) {
  const manifest = domesticManifest(tag, verified);
  if (!manifest) return false;
  const response = await request(`${API}/contents/latest.json?ref=updates`, {allow404: true});
  // Gitee returns HTTP 200 with [] when the requested ref/file is absent.
  const current = Array.isArray(response) && response.length === 0 ? null : response;
  if (current) {
    if (typeof current.content !== 'string' || typeof current.sha !== 'string') {
      throw new Error('Unexpected Gitee updater file response');
    }
    const old = JSON.parse(Buffer.from(current.content, 'base64').toString('utf8'));
    const order = compareVersions(manifest.version, old.version);
    if (order < 0) return false; // Backfilling an old release must never downgrade the feed.
    if (order === 0) {
      if (JSON.stringify(old) !== JSON.stringify(manifest)) throw new Error('Conflicting manifest for an already published version');
      const published = await request(RAW, {binary: true, maxBytes: 65536});
      if (JSON.stringify(JSON.parse(Buffer.from(published).toString('utf8'))) !== JSON.stringify(manifest)) {
        throw new Error('Public Gitee update feed has not returned the committed manifest; rerun to verify');
      }
      return false;
    }
  } else if (!await request(`${API}/branches/updates`, {allow404: true})) {
    await request(`${API}/branches`, {method: 'POST', body: {branch_name: 'updates', refs: tag}});
  }
  const text = JSON.stringify(manifest, null, 2) + '\n';
  await request(`${API}/contents/latest.json`, {method: current ? 'PUT' : 'POST', body: {
    branch: 'updates', message: `Publish signed updater ${tag}`, content: Buffer.from(text).toString('base64'),
    ...(current ? {sha: current.sha} : {}),
  }});
  // Confirm the same unauthenticated endpoint that desktop clients use.
  const published = await request(RAW, {binary: true, maxBytes: 65536});
  if (!Buffer.from(published).equals(Buffer.from(text))) throw new Error('Public Gitee update feed has not returned the committed manifest; rerun to verify');
  return true;
}
