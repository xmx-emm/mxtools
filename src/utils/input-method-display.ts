import type {InputMethodItem} from '@/types/inputMethod.ts';

function isChineseLocale(locale: string) {
  return locale.toLowerCase().startsWith('zh');
}

export function inputMethodDisplayName(item: InputMethodItem, locale: string): string {
  if (!isChineseLocale(locale)) return item.name;
  if (item.capabilities.is_microsoft_pinyin) return '微软拼音';
  if (item.capabilities.is_microsoft_wubi) return '微软五笔';

  const name = item.name.trim();
  const lower = name.toLowerCase();
  const id = item.id.toUpperCase();
  const isUsLayout = lower.includes('us keyboard')
    || lower === 'us'
    || id.endsWith(':00000409')
    || id === '00000409';

  if (isUsLayout) {
    if (item.lang_id.toUpperCase() === '00000804' || id.startsWith('0804:')) {
      return '中文（简体）· 美式键盘';
    }
    if (item.lang_id.toUpperCase() === '00000404' || id.startsWith('0404:')) {
      return '中文（繁体）· 美式键盘';
    }
    return '英语（美国）· 美式键盘';
  }

  return name
    .replace(/Microsoft Pinyin/gi, '微软拼音')
    .replace(/Microsoft Wubi/gi, '微软五笔')
    .replace(/Chinese \(Simplified\)/gi, '中文（简体）')
    .replace(/Chinese \(Traditional\)/gi, '中文（繁体）');
}

export function inputMethodKindKey(item: InputMethodItem): string {
  return item.kind === 'layout'
    ? 'inputMethod.kindLayout'
    : 'inputMethod.kindIme';
}
