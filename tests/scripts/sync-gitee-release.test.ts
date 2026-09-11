import {describe, expect, it, vi} from 'vitest';
import {createHash} from 'node:crypto';
// @ts-expect-error release automation intentionally remains dependency-free JavaScript
import {createTransport, planRelease, syncRelease} from '../../scripts/sync-gitee-release.mjs';

const gh = 'https://api.github.com/repos/xmx-emm/mxtools';
const gt = 'https://gitee.com/api/v5/repos/mengxin_code/mxtools';
const bytes = Buffer.from('signed installer contents');
const release = {id: 7, tag_name: 'v0.0.7', name: 'Version 0.0.7', body: 'Changes', draft: false, prerelease: false};
const asset = {id: 11, name: 'MxTools_0.0.7_x64_setup.exe', size: bytes.length, state: 'uploaded',
  digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  browser_download_url: 'https://github.com/xmx-emm/mxtools/releases/download/v0.0.7/MxTools_0.0.7_x64_setup.exe'};

function fixture({corrupt = false, failUpload = false, mutateSource = false} = {}) {
  let created = false;
  let uploaded = false;
  let sourceReads = 0;
  let failed = false;
  const target = {id: 17, tag_name: release.tag_name};
  const attachment = {id: 23, name: asset.name, browser_download_url: 'https://gitee.com/mengxin_code/mxtools/attach_files/23/download'};
  const calls: Array<{url: string; method: string; body?: Record<string, unknown> | FormData}> = [];
  const request = vi.fn(async (url: string, options: {method?: string; body?: Record<string, unknown> | FormData} = {}) => {
    const method = options.method || 'GET';
    calls.push({url, method, body: options.body});
    if (url === `${gh}/releases/tags/v0.0.7`) return release;
    if (url.startsWith(`${gh}/releases/7/assets?`)) {
      sourceReads++;
      return [mutateSource && sourceReads > 1 ? {...asset, id: 12} : asset];
    }
    if (url === `${gt}/releases/tags/v0.0.7`) return created ? target : null;
    if (url === `${gt}/releases` && method === 'POST') { created = true; return target; }
    if (url === `${gt}/releases/17` && method === 'PATCH') return target;
    if (url.startsWith(`${gt}/releases/17/attach_files?`)) return uploaded ? [attachment] : [];
    if (url === `${gt}/releases/17/attach_files` && method === 'POST') {
      // Server may accept an upload even when its response is lost.
      uploaded = true;
      if (failUpload && !failed) { failed = true; throw new Error('Lost response'); }
      return attachment;
    }
    if (url === asset.browser_download_url) return bytes;
    if (url === attachment.browser_download_url) return corrupt ? Buffer.from('bad') : bytes;
    throw new Error(`Unexpected fixture request: ${method} ${url}`);
  });
  const pushTag = vi.fn();
  const execute = () => syncRelease({tag: release.tag_name, giteeToken: 'test-token', request, pushTag, log: vi.fn()});
  return {execute, calls, pushTag, request};
}

describe('Gitee release mirroring', () => {
  it('copies bytes and release notes, checks both downloads, and reuses identical attachments on rerun', async () => {
    const f = fixture();
    await f.execute();
    await f.execute();
    expect(f.pushTag).toHaveBeenCalledWith('v0.0.7', 'test-token');
    expect(f.calls.filter(c => c.method === 'POST' && c.url === `${gt}/releases`)).toHaveLength(1);
    const uploads = f.calls.filter(c => c.method === 'POST' && c.url.endsWith('/attach_files'));
    expect(uploads).toHaveLength(1);
    const file = (uploads[0].body as FormData).get('file') as File;
    expect(file.name).toBe(asset.name);
    expect(Buffer.from(await file.arrayBuffer())).toEqual(bytes);
    expect(f.calls.filter(c => c.url.endsWith('/23/download'))).toHaveLength(2);
    expect(f.calls.at(-1)?.body).toMatchObject({body: expect.stringContaining('附件同步完成')});
  });

  it('recovers an accepted upload with a lost response without duplicating it', async () => {
    const f = fixture({failUpload: true});
    await expect(f.execute()).rejects.toThrow('Lost response');
    await f.execute();
    expect(f.calls.filter(c => c.method === 'POST' && c.url.endsWith('/attach_files'))).toHaveLength(1);
  });

  it('does not mark a corrupted or changed-source release complete', async () => {
    for (const options of [{corrupt: true}, {mutateSource: true}]) {
      const f = fixture(options);
      await expect(f.execute()).rejects.toThrow();
      expect(f.calls.filter(c => c.method === 'PATCH').every(c =>
        !(c.body as {body: string}).body.includes('附件同步完成'))).toBe(true);
      expect(f.calls.some(c => c.method === 'DELETE')).toBe(false);
    }
  });

  it('dry-run only reads GitHub and missing credentials fail before any operation', async () => {
    const f = fixture();
    await syncRelease({tag: release.tag_name, request: f.request, pushTag: f.pushTag, dryRun: true, log: vi.fn()});
    expect(f.calls.every(c => c.method === 'GET' && c.url.startsWith(gh))).toBe(true);
    expect(f.pushTag).not.toHaveBeenCalled();
    f.request.mockClear();
    await expect(syncRelease({tag: release.tag_name, request: f.request})).rejects.toThrow('GITEE_TOKEN');
    expect(f.request).not.toHaveBeenCalled();
  });

  it('keeps large files as links and publishes an existing manifest after binaries', () => {
    const manifest = {...asset, name: 'latest.json', id: 12};
    const offline = {...asset, name: 'offline.exe', id: 13, size: 217_301_201};
    const plan = planRelease(release, [manifest, offline, asset]);
    expect(plan.mirrored.map((a: {name: string}) => a.name)).toEqual([asset.name, 'latest.json']);
    expect(plan.linked).toEqual([offline]);
  });

  it('rejects invalid releases, source URLs, duplicate files and unfinished uploads before writing', () => {
    for (const bad of [{...release, draft: true}, {...release, prerelease: true}, {...release, tag_name: '../x'}]) {
      expect(() => planRelease(bad, [asset])).toThrow();
    }
    for (const bad of [[], [asset, asset], [{...asset, state: 'new'}], [{...asset, browser_download_url: 'https://evil.test/app.exe'}]]) {
      expect(() => planRelease(release, bad)).toThrow();
    }
    expect(() => planRelease(release, [asset], NaN)).toThrow();
  });
});

describe('Gitee transport boundaries', () => {
  it('retries transient reads but never blindly repeats a mutation', async () => {
    const sleep = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('', {status: 503}))
      .mockResolvedValueOnce(Response.json({ok: true}));
    const request = createTransport({fetchImpl, sleep});
    expect(await request(`${gh}/releases`)).toEqual({ok: true});
    expect(sleep).toHaveBeenCalledOnce();
    fetchImpl.mockReset().mockResolvedValue(new Response('', {status: 503}));
    await expect(request(`${gt}/releases`, {method: 'POST', body: {name: 'x'}})).rejects.toThrow('503');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('keeps tokens on the matching API and out of attachment redirects', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(new Response(null, {status: 302, headers: {location: 'https://cdn.example/file'}}))
      .mockResolvedValueOnce(new Response(bytes));
    const request = createTransport({fetchImpl, githubToken: 'gh-token', giteeToken: 'gt-token'});
    await request(`${gh}/releases`);
    await request(`${gt}/releases`);
    expect(await request(asset.browser_download_url, {binary: true})).toEqual(bytes);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer gh-token');
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer gt-token');
    expect(fetchImpl.mock.calls[2][1].headers.Authorization).toBeUndefined();
    expect(fetchImpl.mock.calls[3][1].headers).toBeUndefined();
  });

  it('does not echo remote bodies or transport error secrets', async () => {
    const request = createTransport({sleep: vi.fn(), fetchImpl: vi.fn().mockRejectedValue(new Error('secret-token'))});
    await expect(request(`${gt}/releases`)).rejects.not.toThrow('secret-token');
    const denied = createTransport({fetchImpl: vi.fn().mockResolvedValue(new Response('secret-token', {status: 403}))});
    await expect(denied(`${gt}/releases`)).rejects.toThrow('HTTP 403');
  });
});
