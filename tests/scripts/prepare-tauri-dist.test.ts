import {execFile as execFileCallback} from 'node:child_process';
import {mkdtemp, mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {afterEach, describe, expect, it} from 'vitest';

const execFile = promisify(execFileCallback);
const preparer = path.resolve(process.cwd(), 'scripts/prepare-tauri-dist.mjs');
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

describe('Tauri frontend preparation', () => {
  it('preserves the report outside dist and removes only build metadata', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'mxtools-tauri-dist-'));
    temporaryRoots.push(root);
    const dist = path.join(root, 'dist');
    const report = path.join(root, 'evidence', 'bundle-report.json');
    await mkdir(path.join(dist, '.vite'), {recursive: true});
    await mkdir(path.join(dist, 'assets'), {recursive: true});
    await writeFile(path.join(dist, '.vite', 'manifest.json'), '{"build":true}');
    await writeFile(path.join(dist, 'bundle-report.json'), '{"failures":[]}');
    await writeFile(path.join(dist, 'assets', 'app.js'), 'console.log("app")');

    await execFile(process.execPath, [preparer, '--dist', dist, '--report-out', report]);

    await expect(stat(path.join(dist, '.vite'))).rejects.toMatchObject({code: 'ENOENT'});
    await expect(stat(path.join(dist, 'bundle-report.json'))).rejects.toMatchObject({code: 'ENOENT'});
    await expect(readFile(path.join(dist, 'assets', 'app.js'), 'utf8')).resolves.toContain('app');
    await expect(readFile(report, 'utf8')).resolves.toBe('{"failures":[]}');
  });
});
