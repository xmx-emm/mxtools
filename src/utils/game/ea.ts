import type {EaDesktopUser} from '@/types/ea.ts';

export interface EaProfileCacheEntry {
  name?: string;
  avatar?: string;
}

export type EaProfileCache = Record<string, EaProfileCacheEntry>;

export function isValidEaDisplayName(
  name: string,
  id: string,
  userUserid: string,
): boolean {
  const t = name.trim();
  if (!t) return false;
  if (/^\d+$/.test(t)) return false;
  if (t === id || t === userUserid) return false;
  if (t === eaDisplayNameFallback(id)) return false;
  return true;
}

export function eaDisplayNameFallback(id: string): string {
  return `EA ${id}`;
}

export function mergeEaUserProfile(
  fresh: EaDesktopUser,
  cacheEntry?: EaProfileCacheEntry,
): EaDesktopUser {
  const name = isValidEaDisplayName(fresh.name, fresh.id, fresh.user_userid)
    ? fresh.name
    : cacheEntry?.name &&
        isValidEaDisplayName(cacheEntry.name, fresh.id, fresh.user_userid)
      ? cacheEntry.name
      : eaDisplayNameFallback(fresh.id);

  const freshAvatar = fresh.avatar?.trim() ?? '';
  const avatar = freshAvatar || cacheEntry?.avatar?.trim() || '';

  return {...fresh, name, avatar};
}

/** 仅用 fresh 侧的有效 name/avatar 更新 cache，避免把 fallback 写入持久化。 */
export function updateEaProfileCache(
  cache: EaProfileCache,
  fresh: EaDesktopUser,
): void {
  const entry: EaProfileCacheEntry = {...cache[fresh.id]};

  if (isValidEaDisplayName(fresh.name, fresh.id, fresh.user_userid)) {
    entry.name = fresh.name;
  }
  const avatar = fresh.avatar?.trim();
  if (avatar) {
    entry.avatar = avatar;
  }

  if (entry.name || entry.avatar) {
    cache[fresh.id] = entry;
  }
}
