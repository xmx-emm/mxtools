import {describe, expect, it, vi} from 'vitest';
import {createLocaleMessageLoader, type LocaleMessageTree} from './locale-loader.ts';

type TestLocale = 'zh-CN' | 'en-US';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, resolve, reject};
}

function createLoader(loaders: Record<TestLocale, () => Promise<{default: LocaleMessageTree}>>) {
  const install = vi.fn();
  const activate = vi.fn();
  return {
    loader: createLocaleMessageLoader({loaders, install, activate}),
    install,
    activate,
  };
}

describe('createLocaleMessageLoader', () => {
  it('caches a loaded locale and shares concurrent requests', async () => {
    const messages = {title: '中文'};
    const zhLoader = vi.fn().mockResolvedValue({default: messages});
    const {loader, install} = createLoader({
      'zh-CN': zhLoader,
      'en-US': vi.fn().mockResolvedValue({default: {title: 'English'}}),
    });

    await Promise.all([loader.load('zh-CN'), loader.load('zh-CN')]);
    await loader.load('zh-CN');

    expect(zhLoader).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
    expect(loader.isLoaded('zh-CN')).toBe(true);
  });

  it('only activates the latest locale request', async () => {
    const zh = deferred<{default: LocaleMessageTree}>();
    const en = deferred<{default: LocaleMessageTree}>();
    const {loader, activate} = createLoader({
      'zh-CN': () => zh.promise,
      'en-US': () => en.promise,
    });

    const first = loader.set('zh-CN');
    const last = loader.set('en-US');
    en.resolve({default: {title: 'English'}});
    zh.resolve({default: {title: '中文'}});

    await expect(first).resolves.toBe(false);
    await expect(last).resolves.toBe(true);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledWith('en-US');
  });

  it('removes failed loads so a later request can retry', async () => {
    const zhLoader = vi.fn()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({default: {title: '中文'}});
    const {loader} = createLoader({
      'zh-CN': zhLoader,
      'en-US': vi.fn().mockResolvedValue({default: {title: 'English'}}),
    });

    await expect(loader.load('zh-CN')).rejects.toThrow('network unavailable');
    await expect(loader.load('zh-CN')).resolves.toEqual({title: '中文'});
    expect(zhLoader).toHaveBeenCalledTimes(2);
    expect(loader.isLoaded('zh-CN')).toBe(true);
  });

  it('keeps the active locale when switching fails', async () => {
    const {loader, activate} = createLoader({
      'zh-CN': vi.fn().mockResolvedValue({default: {title: '中文'}}),
      'en-US': vi.fn().mockRejectedValue(new Error('chunk unavailable')),
    });

    await expect(loader.set('zh-CN')).resolves.toBe(true);
    await expect(loader.set('en-US')).rejects.toThrow('chunk unavailable');

    expect(activate).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenLastCalledWith('zh-CN');
  });
});
