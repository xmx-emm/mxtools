export const milesLanguageCheck = {
  cache: null as { key: string; at: number; value: boolean } | null,
  inFlight: null as Promise<boolean> | null,
};

export function invalidateMilesLanguageCheckCache() {
  milesLanguageCheck.cache = null;
}
