import {describe, expect, it} from 'vitest';
import {ApexPageTypeEnum} from '@/enum.ts';
import {
  resolvePendingGameChangesTarget,
  type PendingGameChangesState,
} from '@/utils/game/pending_game_changes.ts';

function changes(overrides: Partial<PendingGameChangesState> = {}): PendingGameChangesState {
  return {
    currentPath: '/settings',
    currentApexPage: ApexPageTypeEnum.launch,
    apexLaunchModified: false,
    apexVideoModified: false,
    apexGameSettingsModified: false,
    pubgLaunchModified: false,
    ...overrides,
  };
}

describe('pending game changes destination', () => {
  it('keeps the currently visible dirty Apex tab ahead of other Apex edits', () => {
    expect(resolvePendingGameChangesTarget(changes({
      currentPath: '/apex',
      currentApexPage: ApexPageTypeEnum.video_config,
      apexLaunchModified: true,
      apexVideoModified: true,
    }))).toEqual({path: '/apex', page: ApexPageTypeEnum.video_config});
  });

  it('keeps the currently visible dirty PUBG page ahead of Apex edits', () => {
    expect(resolvePendingGameChangesTarget(changes({
      currentPath: '/pubg',
      apexLaunchModified: true,
      pubgLaunchModified: true,
    }))).toEqual({path: '/pubg'});
  });

  it('falls back through Apex tabs and then PUBG in a stable order', () => {
    expect(resolvePendingGameChangesTarget(changes({
      apexVideoModified: true,
      apexGameSettingsModified: true,
      pubgLaunchModified: true,
    }))).toEqual({path: '/apex', page: ApexPageTypeEnum.video_config});
    expect(resolvePendingGameChangesTarget(changes({
      apexGameSettingsModified: true,
      pubgLaunchModified: true,
    }))).toEqual({path: '/apex', page: ApexPageTypeEnum.game_settings});
    expect(resolvePendingGameChangesTarget(changes({
      pubgLaunchModified: true,
    }))).toEqual({path: '/pubg'});
  });

  it('returns no destination when every editor is clean', () => {
    expect(resolvePendingGameChangesTarget(changes())).toBeNull();
  });
});
