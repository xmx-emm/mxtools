import {describe, expect, it} from 'vitest';
import type {ApexConfigSnapshot} from '@/types/apex_config_snapshot.ts';
import {buildApexConfigSnapshot} from '@/utils/game/apex_config_snapshot.ts';
import {
  buildPublishPayload,
  cleanPublishText,
  launcherRefFromKey,
  sanitizePublishLaunchOptions,
} from '@/utils/game/apex_publish_payload.ts';

const defaults: ApexConfigSnapshot = {
  kind: 'apex-config-snapshot', version: 1, exportedAt: '', launchOptions: {raw: ''},
  videoConfig: {'setting.fullscreen': '1', 'setting.defaultres': '1920', 'setting.configversion': '7'},
  gameSettings: {
    settings: {mouse_sensitivity: '5', miles_output_device: ''},
    profile: {cl_fovScale: '1.0'},
    bindings: [
      {input: 'SPACE', command: '+jump', context: 0, occurrence: 0},
      {input: 'w', command: '+forward', context: 0, occurrence: 0},
    ],
  },
};

describe('online preset publish payload', () => {
  it('publishes nothing when the config equals the game defaults', () => {
    const {snapshot, removed} = buildPublishPayload(structuredClone(defaults), defaults);
    expect(snapshot.launchOptions).toBeUndefined();
    expect(snapshot.videoConfig).toBeUndefined();
    expect(snapshot.gameSettings).toBeUndefined();
    expect(removed).toEqual([]);
  });

  it('keeps only modified values and drops device, machine-local and game managed keys', () => {
    const current = structuredClone(defaults);
    current.launchOptions = {raw: '-novid +fps_max 190'};
    current.videoConfig = {'setting.fullscreen': '0', 'setting.defaultres': '2560', 'setting.configversion': '8'};
    current.gameSettings!.settings = {mouse_sensitivity: '2.5', miles_output_device: '{device-guid}'};
    current.gameSettings!.bindings![0].input = 'MOUSE4';
    const {snapshot, removed} = buildPublishPayload(current, defaults);
    expect(snapshot.launchOptions).toEqual({raw: '-novid +fps_max 190'});
    expect(snapshot.videoConfig).toEqual({'setting.fullscreen': '0'});
    expect(snapshot.gameSettings).toEqual({
      settings: {mouse_sensitivity: '2.5'}, profile: {},
      bindings: [{input: 'MOUSE4', command: '+jump', context: 0, occurrence: 0}], bindingsMode: 'patch',
    });
    expect(snapshot.version).toBe(2);
    expect(removed).toEqual([
      {key: 'setting.defaultres', reason: 'device'},
      {key: 'miles_output_device', reason: 'device'},
    ]);
  });

  it('serializes through the snapshot builder exactly as previewed', () => {
    const current = structuredClone(defaults);
    current.gameSettings!.settings.mouse_sensitivity = '3';
    const {snapshot} = buildPublishPayload(current, defaults);
    const built = buildApexConfigSnapshot({
      selection: {launchOptions: false, videoConfig: false, gameSettings: true, aiming: true, controller: true, bindings: false},
      gameSettings: snapshot.gameSettings, exportedAt: 'x',
    });
    expect(built.gameSettings).toEqual({settings: {mouse_sensitivity: '3'}, profile: {}});
  });
});

describe('launch option privacy filter', () => {
  it('removes flag groups that reveal local paths or e-mail addresses', () => {
    expect(sanitizePublishLaunchOptions('-novid -config "C:\\Users\\me\\a.cfg" +fps_max 0')).toEqual({
      raw: '-novid +fps_max 0', removed: ['-config'],
    });
    expect(sanitizePublishLaunchOptions('+name me@example.com -high')).toEqual({raw: '-high', removed: ['+name']});
    expect(sanitizePublishLaunchOptions('-exec /home/me/x.cfg')).toEqual({raw: '', removed: ['-exec']});
  });

  it('keeps ordinary options untouched', () => {
    expect(sanitizePublishLaunchOptions('-dev -preload +m_rawinput 1')).toEqual({raw: '-dev -preload +m_rawinput 1', removed: []});
  });
});

describe('publish text and launcher helpers', () => {
  it('strips control characters, trims and caps by characters', () => {
    expect(cleanPublishText('  a\u0000b\nc  ', 80)).toBe('a b c');
    expect(cleanPublishText('😀'.repeat(5), 3)).toBe('😀😀😀');
  });

  it('parses only steam and ea launcher keys', () => {
    expect(launcherRefFromKey('steam:123')).toEqual({kind: 'steam', id: '123', name: ''});
    expect(launcherRefFromKey('ea:a:b')).toEqual({kind: 'ea', id: 'a:b', name: ''});
    expect(launcherRefFromKey('epic:1')).toBeNull();
    expect(launcherRefFromKey('steam:')).toBeNull();
    expect(launcherRefFromKey(null)).toBeNull();
  });
});
