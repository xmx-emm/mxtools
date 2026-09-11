import {describe, expect, it} from 'vitest';
import {changedSnapshot, mergeBindingPatch} from '@/utils/game/apex_snapshot_changes.ts';
import {buildApexConfigSnapshot, parseApexConfigSnapshot} from '@/utils/game/apex_config_snapshot.ts';
import type {ApexConfigSnapshot} from '@/types/apex_config_snapshot.ts';

const defaults: ApexConfigSnapshot = {kind: 'apex-config-snapshot', version: 1, exportedAt: '', launchOptions: {raw: ''},
  videoConfig: {'setting.fullscreen': '1'}, gameSettings: {settings: {mouse_sensitivity: '5'}, profile: {cl_fovScale: '1.0'},
    bindings: [
      {input: 'SPACE', command: '+jump', context: 0, occurrence: 0},
      {input: 'w', command: '+forward', context: 0, occurrence: 0},
    ]},
};
describe('export differences from game defaults', () => {
  it('omits unchanged values despite numeric formatting and key casing', () => {
    const current = structuredClone(defaults);
    current.gameSettings!.profile.cl_fovScale = '1.0000';
    current.gameSettings!.bindings![1].input = 'W';
    expect(changedSnapshot(current, defaults)).toEqual({kind: defaults.kind, version: 1, exportedAt: ''});
  });
  it('retains custom values already saved and keys without a verified default', () => {
    const current = structuredClone(defaults);
    current.gameSettings!.settings.mouse_sensitivity = '1.5';
    current.videoConfig!['setting.unknown'] = '2';
    const result = changedSnapshot(current, defaults);
    expect(result.gameSettings).toEqual({settings: {mouse_sensitivity: '1.5'}, profile: {}});
    expect(result.videoConfig).toEqual({'setting.unknown': '2'});
  });
  it('round trips sparse binding changes without deleting unchanged destination bindings', () => {
    const current = structuredClone(defaults);
    current.gameSettings!.bindings![0].input = 'MWHEELDOWN';
    const diff = changedSnapshot(current, defaults);
    const serialized = buildApexConfigSnapshot({selection: {launchOptions: false, videoConfig: false, bindings: true}, gameSettings: diff.gameSettings});
    expect(serialized.version).toBe(2);
    const parsed = parseApexConfigSnapshot(JSON.stringify(serialized));
    expect(parsed.gameSettings!.bindings).toHaveLength(1);
    const merged = mergeBindingPatch(defaults.gameSettings!.bindings!, parsed.gameSettings!.bindings!);
    expect(merged.map(b => b.input)).toEqual(['w', 'MWHEELDOWN']);
  });
  it('records explicit unbinding and removes only that binding', () => {
    const current = structuredClone(defaults);
    current.gameSettings!.bindings!.shift();
    const result = changedSnapshot(current, defaults);
    expect(result.gameSettings!.bindings![0].input).toBe('');
    expect(mergeBindingPatch(defaults.gameSettings!.bindings!, result.gameSettings!.bindings!)).toEqual(current.gameSettings!.bindings);
  });
  it('does not permit a patch to masquerade as a version-1 complete binding list', () => {
    expect(() => parseApexConfigSnapshot(JSON.stringify({...defaults,
      gameSettings: {...defaults.gameSettings, bindingsMode: 'patch'},
    }))).toThrow('invalidBindings');
  });
});
