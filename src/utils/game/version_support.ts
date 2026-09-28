export interface InstalledGameVersion {
  version: string | null;
  build: string | null;
  installed: boolean;
}
export type SupportedGame = 'apex' | 'pubg';
export type GameCompatibilityScope = 'configuration' | 'launch';

// Advisory status only; never gate edits/reset or select historical defaults.
export const verifiedGameBuilds: Record<SupportedGame, readonly string[]> = {
  apex: [],
  pubg: [],
};

// Current review labels do not imply runtime verification of every setting.
const reviewedLaunchBuilds: Record<SupportedGame, readonly string[]> = {
  apex: ['R5pc_r5-301_J28_CL11570498_FSv30_1_2026_09_16_17_18'],
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
