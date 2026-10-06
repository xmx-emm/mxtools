export interface InstalledGameVersion {
  version: string | null;
  build: string | null;
  installed: boolean;
}
export type SupportedGame = 'apex' | 'pubg';
export type GameCompatibilityScope = 'configuration' | 'launch';

// Advisory status only; never gate edits/reset or select historical defaults.
export const verifiedGameBuilds: Record<SupportedGame, readonly string[]> = {
  apex: ['R5pc_r5-301_J58_CL11595978_FSv30_1_EX_2026_10_01_16_15'],
  pubg: [],
};

// Apex compatibility is build-level: a launch-only review must never make one
// Apex page look supported while the other configuration pages remain pending.
// PUBG keeps its separate launch-only label until full behavior is verified.
const reviewedLaunchBuilds: Record<SupportedGame, readonly string[]> = {
  apex: [],
  pubg: ['25449918'],
};

export function gameVersionStatus(
  game: SupportedGame,
  value: InstalledGameVersion | null,
  scope: GameCompatibilityScope = 'configuration',
) {
  if (!value) return 'unknown';
  if (!value.installed) return 'notInstalled';
  if (!value.build) return 'unknown';
  if (scope === 'launch' && reviewedLaunchBuilds[game].includes(value.build)) {
    return game === 'apex' ? 'launchReviewed' : 'launchPartial';
  }
  return verifiedGameBuilds[game].includes(value.build) ? 'verified' : 'unverified';
}
