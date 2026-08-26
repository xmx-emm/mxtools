import {describe, expect, it} from 'vitest';
import type {InputMethodItem} from '@/types/inputMethod.ts';
import {inputMethodDisplayName} from '@/utils/input-method-display.ts';

function item(overrides: Partial<InputMethodItem>): InputMethodItem {
  return {
    id: '0409:00000409',
    name: 'US Keyboard (en-US)',
    kind: 'layout',
    lang_id: '00000409',
    enabled: true,
    order: 1,
    capabilities: {
      can_reorder: true,
      can_remove: true,
      can_open_settings: false,
      has_wubi_lexicon: false,
      is_microsoft_pinyin: false,
      is_microsoft_wubi: false,
    },
    ...overrides,
  };
}

describe('inputMethodDisplayName', () => {
  it('uses Chinese product names for Microsoft IMEs', () => {
    expect(inputMethodDisplayName(item({
      name: 'Microsoft Pinyin',
      capabilities: {...item({}).capabilities, is_microsoft_pinyin: true},
    }), 'zh-CN')).toBe('微软拼音');
  });

  it('localizes the US keyboard and its language context', () => {
    expect(inputMethodDisplayName(item({}), 'zh-CN')).toBe('英语（美国）· 美式键盘');
    expect(inputMethodDisplayName(item({
      id: '0804:00000409',
      lang_id: '00000804',
      name: 'US Keyboard (zh-CN)',
    }), 'zh-CN')).toBe('中文（简体）· 美式键盘');
  });

  it('preserves backend names in English', () => {
    expect(inputMethodDisplayName(item({}), 'en-US')).toBe('US Keyboard (en-US)');
  });
});
