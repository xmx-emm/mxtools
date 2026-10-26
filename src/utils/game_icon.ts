export const GAME_ICON_RETRY_DELAYS_MS = [120, 320] as const;
export const GAME_ICON_MAX_CANDIDATES = 8;

interface ReadFirstGameIconOptions {
  maxCandidates?: number;
  retryDelaysMs?: readonly number[];
  wait?: (milliseconds: number) => Promise<void>;
  isStale?: () => boolean;
}

function uniqueExecutableCandidates(paths: readonly string[], limit: number): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const path of paths) {
    const trimmed = path.trim();
    const key = trimmed.toLocaleLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    candidates.push(trimmed);
    if (candidates.length >= limit) break;
  }
  return candidates;
}

function waitFor(milliseconds: number) {
  return new Promise<void>(resolve => setTimeout(resolve, milliseconds));
}

/**
 * Shell icon extraction can transiently fail while the scan results mount.
 * Retry each bounded candidate before leaving the fallback icon permanently.
 */
export async function readFirstGameIcon(
  paths: readonly string[],
  readIcon: (path: string) => Promise<string | null>,
  options: ReadFirstGameIconOptions = {},
): Promise<string | null> {
  const maxCandidates = options.maxCandidates ?? GAME_ICON_MAX_CANDIDATES;
  const retryDelays = options.retryDelaysMs ?? GAME_ICON_RETRY_DELAYS_MS;
  const wait = options.wait ?? waitFor;
  const candidates = uniqueExecutableCandidates(paths, maxCandidates);
  for (const path of candidates) {
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      if (options.isStale?.()) return null;
      const icon = await readIcon(path).catch(() => null);
      if (options.isStale?.()) return null;
      if (icon) return icon;
      if (attempt < retryDelays.length) await wait(retryDelays[attempt]);
    }
  }
  return null;
}
