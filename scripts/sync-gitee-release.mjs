import {Buffer, Blob} from 'node:buffer';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath, URL} from 'node:url';
import {uploadGiteeAttachment} from './gitee-upload.mjs';
import {publishDomesticManifest} from './gitee-updater-manifest.mjs';

const SOURCE = 'xmx-emm/mxtools';
const DESTINATION = 'mengxin_code/mxtools';
const GH = `https://api.github.com/repos/${SOURCE}`;
const GT = `https://gitee.com/api/v5/repos/${DESTINATION}`;
const run = promisify(execFile);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function planRelease(release, assets, maxBytes = 100_000_000) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(release.tag_name)
    || release.draft || release.prerelease) throw new Error('Only published stable vX.Y.Z releases can be mirrored');
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Invalid attachment size limit');
  if (!assets.length) throw new Error('Release has no attachments; upload all files before publishing');
  const names = new Set();
  for (const asset of assets) {
    if (!asset.name || /[/\\\r\n]/u.test(asset.name) || asset.name.includes(String.fromCharCode(0)) || names.has(asset.name)
      || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.state !== 'uploaded') {
      throw new Error('Invalid, duplicate or unfinished GitHub attachment');
    }
    const url = new URL(asset.browser_download_url);
    if (url.origin !== 'https://github.com'
      || !url.pathname.startsWith(`/${SOURCE}/releases/download/${release.tag_name}/`)
      || url.username || url.password || url.search || url.hash) throw new Error('Unexpected GitHub attachment URL');
    names.add(asset.name);
  }
  const mirrored = assets.filter(asset => asset.size <= maxBytes);
  const linked = assets.filter(asset => asset.size > maxBytes);
  if (!mirrored.length) throw new Error('No attachments fit the configured Gitee size limit');
  // Publish any existing update manifest last. Its signed source URLs remain unchanged.
  mirrored.sort((a, b) => Number(a.name === 'latest.json') - Number(b.name === 'latest.json'));
  return {mirrored, linked};
}

function releaseBody(release, linked, complete) {
  const origin = `https://github.com/${SOURCE}/releases/tag/${release.tag_name}`;
  const status = complete ? '附件同步完成，已逐个验证 SHA-256。' : '附件正在同步或等待重试，请暂从 GitHub 获取完整发行文件。';
  const links = linked.map(asset => `- [${asset.name.replace(/[[\]]/g, '')}](${asset.browser_download_url})（${asset.size} 字节，超过镜像附件大小上限）`);
  return `${release.body || ''}\n\n---\nGitHub 原始发行：${origin}\n\n${status}${links.length ? `\n\n以下文件保留 GitHub 下载：\n\n${links.join('\n')}` : ''}`;
}

export function createTransport({githubToken = '', giteeToken = '', fetchImpl = globalThis.fetch, sleep = delay} = {}) {
  async function request(url, {method = 'GET', body, allow404 = false, binary = false, maxBytes = 100_000_000} = {}) {
    if (method === 'POST' && body instanceof globalThis.FormData) {
      return uploadGiteeAttachment(url, body, giteeToken);
    }
    const headers = {};
    if (!binary) {
      headers.Accept = 'application/json';
      const token = url.startsWith(`${GH}/`) ? githubToken : url.startsWith(`${GT}/`) ? giteeToken : '';
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    if (body && !(body instanceof globalThis.FormData)) headers['Content-Type'] = 'application/json';
    const options = {method, headers, body: body instanceof globalThis.FormData ? body : body ? JSON.stringify(body) : undefined};
    const attempts = method === 'GET' ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      let response;
      try {
        response = await fetchImpl(url, {...options, redirect: 'manual', signal: globalThis.AbortSignal.timeout(120_000)});
        // Public download redirects never carry either API token.
        if (binary) {
          for (let hop = 0; response.status >= 300 && response.status < 400 && hop < 5; hop++) {
            const location = response.headers.get('location');
            if (!location) throw new Error('Missing download redirect');
            const next = new URL(location, url);
            if (next.protocol !== 'https:' || next.username || next.password) throw new Error('Unsafe download redirect');
            await response.body?.cancel();
            url = next.href;
            response = await fetchImpl(url, {redirect: 'manual', signal: globalThis.AbortSignal.timeout(120_000)});
          }
        }
        if (allow404 && response.status === 404) return null;
        if (!response.ok) {
          const status = response.status;
          await response.body?.cancel();
          if ((status === 429 || status >= 500) && attempt + 1 < attempts) {
            await sleep(1000 * 2 ** attempt);
            continue;
          }
          throw Object.assign(new Error(`Remote ${method} failed (HTTP ${status}); check token permissions, quota and repository access`), {httpStatus: status});
        }
        if (!binary) return await response.json();
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > maxBytes) throw new Error('Download exceeds expected attachment size');
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      } catch (error) {
        if (error.httpStatus || attempt + 1 === attempts) {
          // Do not expose remote response bodies, URLs or credentials in errors.
          const code = error.name === 'TimeoutError' ? 'timeout'
            : /^[A-Z_]+$/.test(error.cause?.code || '') ? error.cause.code : 'network/response validation';
          throw new Error(error.httpStatus ? error.message : `Remote ${method} failed (${code}); rerun to resume verified attachments`);
        }
        await sleep(1000 * 2 ** attempt);
      }
    }
  }
  return request;
}

async function listAll(request, url) {
  const items = [];
  for (let page = 1; page <= 100; page++) {
    const batch = await request(`${url}?per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error('Unexpected attachment list');
    items.push(...batch);
    if (batch.length < 100) return items;
  }
  throw new Error('Too many attachments');
}

export async function syncTag(tag, token) {
  // Separate bare repository avoids changing the user's checkout or local tags.
  const dir = await mkdtemp(path.join(tmpdir(), 'mxtools-release-tag-'));
  try {
    await run('git', ['init', '--bare', dir]);
    await run('git', ['-C', dir, 'fetch', '--no-tags', `https://github.com/${SOURCE}.git`, `refs/tags/${tag}:refs/tags/${tag}`], {timeout: 180_000});
    const auth = Buffer.from(`mengxin_code:${token}`).toString('base64');
    await run('git', ['-C', dir, 'push', `https://gitee.com/${DESTINATION}.git`, `refs/tags/${tag}:refs/tags/${tag}`], {
      env: {...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '2',
        GIT_CONFIG_KEY_0: 'http.https://gitee.com/.extraHeader', GIT_CONFIG_VALUE_0: `Authorization: Basic ${auth}`,
        GIT_CONFIG_KEY_1: 'credential.helper', GIT_CONFIG_VALUE_1: ''},
      timeout: 180_000,
    });
  } catch {
    throw new Error('Tag sync failed; check Gitee Git write permission and conflicting tags. Existing tags are never force-overwritten');
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}

export async function syncRelease({tag, githubToken = '', giteeToken = '', maxBytes = 100_000_000,
  dryRun = false, request = createTransport({githubToken, giteeToken}), pushTag = syncTag, log = console.log}) {
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag || '')) throw new Error('RELEASE_TAG must be a stable vX.Y.Z tag');
  if (!dryRun && !giteeToken) throw new Error('Add the GITEE_TOKEN repository Actions secret first');
  const release = await request(`${GH}/releases/tags/${encodeURIComponent(tag)}`);
  if (release.tag_name !== tag || !Number.isSafeInteger(release.id)) throw new Error('GitHub release identity mismatch');
  const assets = await listAll(request, `${GH}/releases/${release.id}/assets`);
  const plan = planRelease(release, assets, maxBytes);
  if (dryRun) {
    log(`Read-only plan for ${tag}: ${plan.mirrored.length} mirrored attachments; ${plan.linked.length} GitHub-only links`);
    return plan;
  }
  // Push just the authentic release tag and its reachable commits, without moving branches.
  await pushTag(tag, giteeToken);
  let target = await request(`${GT}/releases/tags/${encodeURIComponent(tag)}`, {allow404: true});
  const fields = {tag_name: tag, name: release.name || tag, body: releaseBody(release, plan.linked, false), prerelease: false};
  if (!target) target = await request(`${GT}/releases`, {method: 'POST', body: {...fields, target_commitish: tag}});
  if (!Number.isSafeInteger(target.id) || target.tag_name !== tag) throw new Error('Gitee release identity mismatch');
  await request(`${GT}/releases/${target.id}`, {method: 'PATCH', body: fields});
  const attachmentUrl = `${GT}/releases/${target.id}/attach_files`;
  const existing = await listAll(request, attachmentUrl);
  const verified = new Map();
  for (const asset of plan.mirrored) {
    log(`Downloading source attachment ${asset.id} (${asset.size} bytes)`);
    const bytes = await request(asset.browser_download_url, {binary: true, maxBytes: asset.size});
    if (bytes.length !== asset.size) throw new Error('GitHub attachment length mismatch');
    const sha = digest(bytes);
    if (asset.digest && asset.digest !== `sha256:${sha}`) throw new Error('GitHub attachment digest mismatch');
    const matches = existing.filter(item => item.name === asset.name);
    if (matches.length > 1) throw new Error('Duplicate Gitee attachment names; resolve before retrying');
    let uploaded = matches[0];
    if (!uploaded) {
      log(`Uploading attachment ${asset.id} to Gitee`);
      const form = new globalThis.FormData();
      form.set('file', new Blob([bytes], {type: 'application/octet-stream'}), asset.name);
      uploaded = await request(attachmentUrl, {method: 'POST', body: form});
    }
    if (!uploaded || uploaded.name !== asset.name || !Number.isSafeInteger(uploaded.id)) throw new Error('Unexpected Gitee upload response');
    const downloadUrl = new URL(uploaded.browser_download_url);
    if (downloadUrl.origin !== 'https://gitee.com' || downloadUrl.username || downloadUrl.password) throw new Error('Unexpected Gitee download URL');
    log(`Verifying Gitee attachment ${uploaded.id}`);
    const mirrored = await request(downloadUrl.href, {binary: true, maxBytes: asset.size});
    if (mirrored.length !== bytes.length || digest(mirrored) !== sha) {
      throw new Error('Gitee attachment differs from GitHub; refusing to overwrite it. Resolve the conflicting attachment before retrying');
    }
    log(`Verified attachment ${asset.id} (${asset.size} bytes)${matches.length ? ' — reused' : ''}`);
    verified.set(asset.name, {url: downloadUrl.href,
      ...((asset.name === 'latest.json' || asset.name.endsWith('.sig')) && bytes.length <= 65536
        ? {text: bytes.toString('utf8')} : {}),
    });
  }
  // Detect source edits during transfer before reporting the mirror as complete.
  const after = await listAll(request, `${GH}/releases/${release.id}/assets`);
  const identity = list => JSON.stringify(list.map(a => [a.id, a.name, a.size, a.updated_at, a.digest]).sort((a, b) => a[0] - b[0]));
  if (identity(after) !== identity(assets)) throw new Error('GitHub attachments changed during sync; rerun after publishing is complete');
  if (await publishDomesticManifest(tag, verified, request)) log('Published verified Gitee update feed');
  await request(`${GT}/releases/${target.id}`, {method: 'PATCH', body: {...fields, body: releaseBody(release, plan.linked, true)}});
  log(`Synced ${tag}: ${plan.mirrored.length} verified attachments, ${plan.linked.length} GitHub-only links`);
  return plan;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncRelease({tag: process.env.RELEASE_TAG, githubToken: process.env.GITHUB_TOKEN,
    giteeToken: process.env.GITEE_TOKEN, maxBytes: Number(process.env.GITEE_MAX_ASSET_BYTES || 100_000_000),
    dryRun: process.argv.includes('--dry-run'),
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
