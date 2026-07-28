import {describe, expect, it} from 'vitest';
import enUS from './locales/en-US/index.ts';
import zhCN from './locales/zh-CN/index.ts';

function collectLeafPaths(value: unknown, path = ''): string[] {
  if (typeof value === 'string') return [path];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected a string leaf or message object at ${path || '<root>'}`);
  }
  return Object.entries(value).flatMap(([key, child]) => collectLeafPaths(child, path ? `${path}.${key}` : key));
}

describe('locale message parity', () => {
  it('keeps Chinese and English message keys identical with string leaves', () => {
    expect(collectLeafPaths(zhCN).sort()).toEqual(collectLeafPaths(enUS).sort());
  });
});
