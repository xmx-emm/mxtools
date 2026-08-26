import {describe, expect, it} from 'vitest';
import enUS from '@/i18n/locales/en-US/index.ts';
import zhCN from '@/i18n/locales/zh-CN/index.ts';
import ApexVideoConfig from '@/data/apex_video_config.ts';
import type {ApexVideoConfigImpl} from '@/types/apex.ts';

function collectLeafPaths(value: unknown, path = ''): string[] {
  if (typeof value === 'string') return [path];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected a string leaf or message object at ${path || '<root>'}`);
  }
  return Object.entries(value).flatMap(([key, child]) => collectLeafPaths(child, path ? `${path}.${key}` : key));
}

function messageAt(messages: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (value, segment) => value && typeof value === 'object'
      ? (value as Record<string, unknown>)[segment]
      : undefined,
    messages,
  );
}

describe('locale message parity', () => {
  it('keeps Chinese and English message keys identical with string leaves', () => {
    expect(collectLeafPaths(zhCN).sort()).toEqual(collectLeafPaths(enUS).sort());
  });

  it('localizes every textual Apex video preset label', () => {
    const items = ApexVideoConfig.filter(
      (item): item is ApexVideoConfigImpl => typeof item !== 'string',
    );
    const labels = items.flatMap((item) => [
      ...(item.options ?? []),
      ...(item.coverageOptions ?? []),
    ]).map((option) => option.label);

    for (const label of labels) {
      if (/^[\d.:xX +\-/]+$/.test(label)) continue;
      expect(messageAt(zhCN, label), `Missing zh-CN message for ${label}`).toBeTypeOf('string');
      expect(messageAt(enUS, label), `Missing en-US message for ${label}`).toBeTypeOf('string');
    }
  });
});
