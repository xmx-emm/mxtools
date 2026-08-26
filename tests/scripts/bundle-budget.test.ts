import {execFile as execFileCallback} from 'node:child_process';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {afterEach, describe, expect, it} from 'vitest';

const execFile = promisify(execFileCallback);
const checker = path.resolve(process.cwd(), 'scripts/bundle-budget.mjs');
const temporaryRoots: string[] = [];

type ManifestEntry = {
  file: string;
  imports?: string[];
  css?: string[];
  isEntry?: boolean;
  isDynamicEntry?: boolean;
};

async function createDist(entries: Record<string, ManifestEntry>, sizes: Record<string, number>) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'mxtools-bundle-budget-'));
  temporaryRoots.push(temporaryRoot);
  const dist = path.join(temporaryRoot, 'dist');
  await mkdir(path.join(dist, '.vite'), {recursive: true});
  await writeFile(path.join(dist, '.vite', 'manifest.json'), JSON.stringify(entries));
  await Promise.all(Object.entries(sizes).map(async ([file, size]) => {
    const target = path.join(dist, file);
    await mkdir(path.dirname(target), {recursive: true});
    await writeFile(target, Buffer.alloc(size, 'x'));
  }));
  return dist;
}

async function check(dist: string) {
  try {
    const result = await execFile(process.execPath, [checker, '--check', '--dist', dist]);
    return {code: 0, ...result};
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & {stdout?: string; stderr?: string; code?: number};
    return {code: failure.code ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? ''};
  }
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

describe('bundle budget checker', () => {
  it('accepts a small manifest and writes its report inside the supplied dist directory', async () => {
    const dist = await createDist({
      'src/main.ts': {file: 'assets/main.js', isEntry: true},
      'src/i18n/locales/en-US/index.ts': {file: 'assets/en.js', isDynamicEntry: true},
    }, {'assets/main.js': 1024, 'assets/en.js': 1024});

    const result = await check(dist);

    expect(result.code).toBe(0);
    const report = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(dist, 'bundle-report.json'), 'utf8'));
    expect(report.failures).toEqual([]);
  });

  it('fails a single oversized JavaScript chunk', async () => {
    const dist = await createDist({
      'src/main.ts': {file: 'assets/main.js', isEntry: true},
    }, {'assets/main.js': 186 * 1024});

    const result = await check(dist);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('JavaScript chunk assets/main.js');
  });

  it('fails when startup plus the largest locale closure exceeds its budget', async () => {
    const dist = await createDist({
      'src/main.ts': {file: 'assets/main.js', imports: ['src/startup-dependency.ts'], isEntry: true},
      'src/startup-dependency.ts': {file: 'assets/dependency.js'},
      'src/i18n/locales/en-US/index.ts': {file: 'assets/en.js', isEntry: true, isDynamicEntry: true},
    }, {
      'assets/main.js': 184 * 1024,
      'assets/dependency.js': 184 * 1024,
      'assets/en.js': 184 * 1024,
    });

    const result = await check(dist);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Startup JS plus largest locale');
  });

  it('fails when the aggregate JavaScript budget is exceeded', async () => {
    const entries: Record<string, ManifestEntry> = {};
    const sizes: Record<string, number> = {};
    for (let index = 0; index < 9; index += 1) {
      entries[`src/chunk-${index}.ts`] = {file: `assets/chunk-${index}.js`, isDynamicEntry: true};
      sizes[`assets/chunk-${index}.js`] = 170 * 1024;
    }
    const dist = await createDist(entries, sizes);

    const result = await check(dist);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('All JavaScript');
  });
});
