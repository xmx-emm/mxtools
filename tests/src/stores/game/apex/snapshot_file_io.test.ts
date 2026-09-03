import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import type {SteamUser} from '@/types/steam.ts';
import {parseApexConfigSnapshot} from '@/utils/game/apex_config_snapshot.ts';

const mocks = vi.hoisted(() => ({writeUtf8File: vi.fn()}));

vi.mock('@/ipc/commands.ts', async () => {
  const actual = await vi.importActual<typeof import('@/ipc/commands.ts')>('@/ipc/commands.ts');
  return {...actual, writeUtf8File: mocks.writeUtf8File};
});

import {useApexStore} from '@/stores/game/apex/index.ts';
import {useSteamStore} from '@/stores/game/steam.ts';

let fixtureRoot = '';

function prepareLaunchOnlyStore() {
  const steam = useSteamStore();
  const apex = useApexStore();
  const user: SteamUser = {
    id: 'fixture-user',
    name: 'Fixture Steam User',
    avatar: '',
    config_path: join(fixtureRoot, 'localconfig.vdf'),
  };
  steam.steam_users = [user];
  apex.set_active_apex_account({kind: 'steam', user});
  apex.launcher_selection_key = 'steam:fixture-user';
  apex.launch_loaded_for_key = 'steam:fixture-user';
  apex.launch_load_status = 'ready';
  apex.parse_loaded_launch_string('+fps_max 240 +miles_language english');
  return apex;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  fixtureRoot = mkdtempSync(join(tmpdir(), 'mxtools-apex-snapshot-'));
  mocks.writeUtf8File.mockImplementation(async ({path, content}: {path: string; content: string}) => {
    const {writeFileSync, mkdirSync} = await import('node:fs');
    mkdirSync(dirname(path), {recursive: true});
    writeFileSync(path, content, 'utf8');
  });
});

afterEach(() => {
  rmSync(fixtureRoot, {recursive: true, force: true});
});

describe('Apex snapshot filesystem export', () => {
  it('writes a real JSON file that can be read and parsed again', async () => {
    const apex = prepareLaunchOnlyStore();
    const output = join(fixtureRoot, 'exports', 'apex-config-snapshot.json');

    await apex.export_config_snapshot_to_file(output, {
      launchOptions: true,
      videoConfig: false,
      gameSettings: false,
      aiming: false,
      controller: false,
      bindings: false,
    });

    const content = readFileSync(output, 'utf8');
    expect(parseApexConfigSnapshot(content)).toMatchObject({
      version: 1,
      kind: 'apex-config-snapshot',
      launchOptions: {raw: '+fps_max 240 +miles_language english'},
    });
  });
});
