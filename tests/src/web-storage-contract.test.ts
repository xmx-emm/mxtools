import {readdirSync, readFileSync, statSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const productionRoots = [resolve(root, 'index.html'), resolve(root, 'public'), resolve(root, 'src')];
const webStorageIdentifier = /\b(?:local|session)Storage\b/;

function sourceFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap(entry => sourceFiles(resolve(path, entry)));
}

describe('Web Storage contract', () => {
  it('keeps production code on Pinia, Tauri events, or native IPC', () => {
    const violations = productionRoots
      .flatMap(sourceFiles)
      .filter(path => webStorageIdentifier.test(readFileSync(path, 'utf8')))
      .map(path => path.slice(root.length + 1).replace(/\\/g, '/'));

    expect(violations).toEqual([]);
  });
});
