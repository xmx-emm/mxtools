export interface InstalledGameVersion {
  version: string | null;
  build: string | null;
  installed: boolean;
}
export type SupportedGame = 'apex' | 'pubg';

// Only exact builds with completed configuration verification belong here.
export const verifiedGameBuilds: Record<SupportedGame, readonly string[]> = {
  apex: ['R5pc_r5-300_J57_CL11457258_2026_08_19_15_40'],
  pubg: [],
};

export function gameVersionStatus(game: SupportedGame, value: InstalledGameVersion | null) {
  if (!value) return 'unknown';
  if (!value.installed) return 'notInstalled';
  if (!value.build) return 'unknown';
  return verifiedGameBuilds[game].includes(value.build) ? 'verified' : 'unverified';
}
