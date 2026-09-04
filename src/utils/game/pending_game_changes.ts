import {ApexPageTypeEnum} from '@/enum.ts';

export interface PendingGameChangesState {
  currentPath: string;
  currentApexPage: ApexPageTypeEnum;
  apexLaunchModified: boolean;
  apexVideoModified: boolean;
  apexGameSettingsModified: boolean;
  pubgLaunchModified: boolean;
}

export type PendingGameChangesTarget =
  | {path: '/apex'; page: ApexPageTypeEnum}
  | {path: '/pubg'};

function isApexPageModified(
  state: PendingGameChangesState,
  page: ApexPageTypeEnum,
) {
  switch (page) {
    case ApexPageTypeEnum.launch:
      return state.apexLaunchModified;
    case ApexPageTypeEnum.video_config:
      return state.apexVideoModified;
    case ApexPageTypeEnum.game_settings:
      return state.apexGameSettingsModified;
    default:
      return false;
  }
}

export function resolvePendingGameChangesTarget(
  state: PendingGameChangesState,
): PendingGameChangesTarget | null {
  if (state.currentPath === '/apex' && isApexPageModified(state, state.currentApexPage)) {
    return {path: '/apex', page: state.currentApexPage};
  }
  if (state.currentPath === '/pubg' && state.pubgLaunchModified) {
    return {path: '/pubg'};
  }
  if (state.apexLaunchModified) {
    return {path: '/apex', page: ApexPageTypeEnum.launch};
  }
  if (state.apexVideoModified) {
    return {path: '/apex', page: ApexPageTypeEnum.video_config};
  }
  if (state.apexGameSettingsModified) {
    return {path: '/apex', page: ApexPageTypeEnum.game_settings};
  }
  if (state.pubgLaunchModified) {
    return {path: '/pubg'};
  }
  return null;
}
