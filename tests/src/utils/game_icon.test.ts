import {describe, expect, it, vi} from 'vitest';
import {GAME_ICON_RETRY_DELAYS_MS, readFirstGameIcon} from '@/utils/game_icon.ts';

describe('local game icon loading', () => {
  it('deduplicates candidate paths and returns the first successful icon', async () => {
    const readIcon = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('second');

    const icon = await readFirstGameIcon(
      [' D:\\Games\\One.exe ', 'd:\\games\\ONE.EXE', 'D:\\Games\\Two.exe'],
      readIcon,
      {retryDelaysMs: []},
    );

    expect(icon).toBe('second');
    expect(readIcon.mock.calls.map(([path]) => path)).toEqual([
      'D:\\Games\\One.exe',
      'D:\\Games\\Two.exe',
    ]);
  });

  it('retries a transient extraction failure on the same executable', async () => {
    const readIcon = vi.fn()
      .mockRejectedValueOnce(new Error('shell icon busy'))
      .mockResolvedValueOnce('icon');
    const wait = vi.fn().mockResolvedValue(undefined);

    const icon = await readFirstGameIcon(
      ['D:\\Games\\One.exe'],
      readIcon,
      {wait},
    );

    expect(icon).toBe('icon');
    expect(readIcon).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(GAME_ICON_RETRY_DELAYS_MS[0]);
  });

  it('retries successful paths before falling through to the next candidate', async () => {
    const readIcon = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue('second');
    const wait = vi.fn().mockResolvedValue(undefined);

    const icon = await readFirstGameIcon(
      ['D:\\Games\\First.exe', 'D:\\Games\\Second.exe'],
      readIcon,
      {wait},
    );

    expect(icon).toBe('second');
    expect(readIcon).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it('bounds candidates and stops when the component is stale', async () => {
    const readIcon = vi.fn().mockResolvedValue(null);
    const readNull = await readFirstGameIcon(
      ['1.exe', '2.exe', '3.exe'],
      readIcon,
      {maxCandidates: 2, retryDelaysMs: []},
    );
    expect(readNull).toBeNull();
    expect(readIcon).toHaveBeenCalledTimes(2);

    const staleRead = vi.fn().mockResolvedValue('icon');
    expect(await readFirstGameIcon(
      ['1.exe'],
      staleRead,
      {isStale: () => true},
    )).toBeNull();
    expect(staleRead).not.toHaveBeenCalled();
  });
});
