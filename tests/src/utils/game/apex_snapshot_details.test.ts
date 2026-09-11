import {describe, expect, it} from 'vitest';
import {snapshotDetails} from '@/utils/game/apex_snapshot_details.ts';
import type {ApexConfigSnapshot} from '@/types/apex_config_snapshot.ts';

const snapshot: ApexConfigSnapshot = {version: 1, kind: 'apex-config-snapshot', exportedAt: '',
  launchOptions: {raw: '+fps_max 279 +exec "a +b.cfg" +cl_fovScale -1 -novid'},
  gameSettings: {settings: {mouse_sensitivity: '1.049330'}, profile: {cl_fovScale: '1.7'},
    bindings: [
      {input: 'ESCAPE', command: 'ingamemenu_activate', context: 0, occurrence: 0},
      {input: 'START', command: 'ingamemenu_activate', context: 0, occurrence: 1},
    ]}, videoConfig: {'setting.fullscreen': '1', 'setting.unknown': 'raw'},
};
describe('snapshot detail rows', () => {
  it('keeps quoted arguments and negative values intact without truncating', () => {
    expect(snapshotDetails(snapshot, 'launch').map(row => [row.key, row.value])).toEqual([
      ['+fps_max', '279'], ['+exec', '"a +b.cfg"'], ['+cl_fovScale', '-1'], ['-novid', ''],
    ]);
  });
  it('preserves every binding including repeated contexts and their occurrence', () => {
    const rows = snapshotDetails(snapshot, 'bindings');
    expect(rows.map(row => row.value)).toEqual(['ESCAPE', 'START']);
    expect(rows[0].source).not.toBe(rows[1].source);
  });
  it('lists each video key and identifies settings files', () => {
    expect(snapshotDetails(snapshot, 'video').map(row => row.key)).toEqual(['setting.fullscreen', 'setting.unknown']);
    expect(snapshotDetails(snapshot, 'aiming').some(row => row.source === 'settings.cfg' && row.value === '1.049330')).toBe(true);
  });
});
