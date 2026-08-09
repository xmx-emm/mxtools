export type ApexLaunchRepairPhase =
  | 'idle'
  | 'scanning'
  | 'ready'
  | 'refreshing'
  | 'repairing';

export const INITIAL_APEX_LAUNCH_REPAIR_PHASE: ApexLaunchRepairPhase = 'idle';

export const APEX_LAUNCH_REPAIR_CHECK_IDS = [
  'installation',
  'processes',
  'game_files',
  'anti_cheat',
  'crash_logs',
  'configuration',
  'apex_cache',
  'shader_cache',
  'runtime',
  'conflicts',
] as const;

export function apexLaunchRepairLoadPhase(hasReport: boolean): ApexLaunchRepairPhase {
  return hasReport ? 'refreshing' : 'scanning';
}

export function apexLaunchRepairLoadFailurePhase(hasReport: boolean): ApexLaunchRepairPhase {
  return hasReport ? 'ready' : 'idle';
}
