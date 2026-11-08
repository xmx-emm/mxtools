import {beforeEach, describe, expect, it, vi} from 'vitest';

const {getAppInfo} = vi.hoisted(() => ({getAppInfo: vi.fn()}));
vi.mock('@/ipc/commands.ts', () => ({getAppInfo}));

async function load() {
  vi.resetModules();
  return import('@/utils/app_info.ts');
}

describe('store build detection', () => {
  beforeEach(() => getAppInfo.mockReset());

  it('reports the Microsoft Store distribution and caches the lookup', async () => {
    getAppInfo.mockResolvedValue({version: '0.1.2', distribution: 'store'});
    const {isStoreBuild} = await load();
    await expect(isStoreBuild()).resolves.toBe(true);
    await expect(isStoreBuild()).resolves.toBe(true);
    expect(getAppInfo).toHaveBeenCalledTimes(1);
  });

  it('treats other distributions as non-Store', async () => {
    getAppInfo.mockResolvedValue({version: '0.1.2', distribution: 'installer'});
    const {isStoreBuild} = await load();
    await expect(isStoreBuild()).resolves.toBe(false);
  });

  it('retries after a failed lookup and reports non-Store meanwhile', async () => {
    getAppInfo.mockRejectedValueOnce(new Error('no tauri'))
      .mockResolvedValueOnce({version: '0.1.2', distribution: 'store'});
    const {isStoreBuild} = await load();
    await expect(isStoreBuild()).resolves.toBe(false);
    await expect(isStoreBuild()).resolves.toBe(true);
    expect(getAppInfo).toHaveBeenCalledTimes(2);
  });

  it('keeps the reactive flag unknown until the lookup settles', async () => {
    getAppInfo.mockResolvedValue({version: '0.1.2', distribution: 'store'});
    const {useIsStoreBuild} = await load();
    const flag = useIsStoreBuild();
    expect(flag.value).toBeNull();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(flag.value).toBe(true);
  });
});
