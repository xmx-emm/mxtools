import {execFile as execFileCallback} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {afterEach, describe, expect, it} from 'vitest';

const execFile = promisify(execFileCallback);
const checker = path.resolve(process.cwd(), 'scripts/release-size-budget.mjs');
const temporaryRoots: string[] = [];

async function runCheck(portableBytes: number, installerBytes: number, storeBytes = 10_000) {
  const root = await mkdtemp(path.join(tmpdir(), 'mxtools-release-size-'));
  temporaryRoots.push(root);
  const portable = path.join(root, 'portable.exe');
  const installer = path.join(root, 'installer.exe');
  const store = path.join(root, 'store.exe');
  await writeFile(portable, Buffer.alloc(portableBytes));
  await writeFile(installer, Buffer.alloc(installerBytes));
  await writeFile(store, Buffer.alloc(storeBytes));

  try {
    const result = await execFile(process.execPath, [
      checker,
      '--portable', portable,
      '--installer', installer,
      '--store', store,
      '--limit', '1000',
    ]);
    return {code: 0, ...result};
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & {stdout?: string; stderr?: string; code?: number};
    return {code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? ''};
  }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

describe('release artifact size budget', () => {
  it('accepts artifacts strictly below the byte limit', async () => {
    expect((await runCheck(999, 999)).code).toBe(0);
  });

  it('rejects an artifact equal to the byte limit', async () => {
    const result = await runCheck(1000, 999);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('便携版 is 1 bytes over');
  });
});
