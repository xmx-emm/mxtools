import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import type {ApexConfigSnapshot} from '@/types/apex_config_snapshot.ts';

const mocks = vi.hoisted(() => ({
  apexIsRunning: vi.fn(),
  getApexVideoconfigReadonly: vi.fn(),
  mutateApexConfig: vi.fn(),
}));

vi.mock('vue-toastification', () => ({
  useToast: () => ({error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn()}),
}));
vi.mock('@/ipc/commands.ts', async () => {
  const actual = await vi.importActual<typeof import('@/ipc/commands.ts')>('@/ipc/commands.ts');
  return {...actual, ...mocks};
});

import {useApexStore} from '@/stores/game/apex/index.ts';

const snapshot: ApexConfigSnapshot = {
  version: 1,
  kind: 'apex-config-snapshot',
  exportedAt: '2026-08-31T00:00:00.000Z',
  launchOptions: {raw: '+fps_max 240'},
  videoConfig: {'setting.fullscreen': '1'},
  gameSettings: {
    settings: {gfx_nvnUseLowLatency: '1'},
    profile: {gamepad_aim_speed: '4'},
    bindings: [],
  },
};

function prepareStore() {
  const apex = useApexStore();
  apex.video_config_loaded = true;
  apex.video_config_values = {'setting.fullscreen': '0'};
  apex.original_video_config = {'setting.fullscreen': '0'};
  apex.game_settings_loaded = true;
  apex.game_settings_report = {
    settings: {path: 'settings.cfg', revision: 's1', values: {gfx_nvnUseLowLatency: '0'}, unknownKeys: [], backupAvailable: false},
    profile: {path: 'profile.cfg', revision: 'p1', values: {gamepad_aim_speed: '2'}, unknownKeys: [], backupAvailable: false},
    bindings: [],
  };
  apex.game_settings_values = {settings: {gfx_nvnUseLowLatency: '0'}, profile: {gamepad_aim_speed: '2'}};
  apex.original_game_settings_values = {settings: {gfx_nvnUseLowLatency: '0'}, profile: {gamepad_aim_speed: '2'}};
  return apex;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  mocks.apexIsRunning.mockResolvedValue(false);
  mocks.getApexVideoconfigReadonly.mockResolvedValue(false);
  mocks.mutateApexConfig.mockResolvedValue({changedScopes: ['videoConfig'], gameSettingsReport: null, videoConfig: null, launchOptions: null, historyEntry: null});
});

describe('Apex snapshot import selection matrix', () => {
  it.each([
    ['video only', {importVideoConfig: true}, {videoUpdates: {'setting.fullscreen': '1'}, launchOptions: null, gameSettings: null}],
    ['game settings only', {importGameSettings: true}, {videoUpdates: {}, launchOptions: null, gameSettings: expect.objectContaining({settingsUpdates: {gfx_nvnUseLowLatency: '1'}, profileUpdates: {}})}],
    ['controller only', {importController: true}, {videoUpdates: {}, launchOptions: null, gameSettings: expect.objectContaining({settingsUpdates: {}, profileUpdates: {gamepad_aim_speed: '4'}})}],
  ])('%s sends only selected scopes', async (_name, selected, expected) => {
    const apex = prepareStore();
    const applied = await apex.apply_config_snapshot(snapshot, {
      importLaunchOptions: false,
      importVideoConfig: false,
      importGameSettings: false,
      importAiming: false,
      importController: false,
      importBindings: false,
      videoSelectMode: 'all',
      selectedVideoItemIds: [],
      ...selected,
    });
    expect(applied).toBe(true);
    expect(mocks.mutateApexConfig).toHaveBeenCalledWith({request: expect.objectContaining(expected)});
  });

  it('does not write when every import block is deselected', async () => {
    const apex = prepareStore();
    expect(await apex.apply_config_snapshot(snapshot, {
      importLaunchOptions: false, importVideoConfig: false, importGameSettings: false,
      importAiming: false, importController: false, importBindings: false,
      videoSelectMode: 'all', selectedVideoItemIds: [],
    })).toBe(false);
    expect(mocks.mutateApexConfig).not.toHaveBeenCalled();
  });
});
