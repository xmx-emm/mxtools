import {describe, expect, it, vi} from 'vitest';

const i18n = vi.hoisted(() => ({
  te: vi.fn((key: string) => [
    'folderSharing.errors.bad_credentials',
    'apex.gameSettings.errors.fileChanged',
    'razerPolling.errors.noResponse',
    'windows.errors.explorerRestartFailed',
  ].includes(key)),
  t: vi.fn((key: string, values?: Record<string, unknown>) => {
    if (key === 'folderSharing.errors.bad_credentials') {
      return `Credentials rejected for ${String(values?.account ?? '')}`;
    }
    if (key === 'ipc.errors.operationFailed') return 'Command failed';
    return key;
  }),
}));

vi.mock('@/i18n/i18n.ts', () => ({
  default: {global: i18n},
}));

import {
  formatIpcError,
  IpcCommandError,
  ipcErrorKey,
  normalizeIpcError,
} from './error.ts';

describe('IPC error normalization', () => {
  it('preserves a structured Tauri error payload', () => {
    expect(normalizeIpcError({
      code: 'folder_sharing.bad_credentials',
      message: 'Access denied',
      details: {account: 'alice'},
    }, 'connect_folder_share')).toEqual({
      code: 'folder_sharing.bad_credentials',
      message: 'Access denied',
      details: {account: 'alice'},
    });
  });

  it('accepts structured JSON and maps legacy strings to the command domain', () => {
    expect(normalizeIpcError(
      '{"code":"apex.file_changed","message":"settings.cfg changed"}',
      'save_apex_settings',
    )).toEqual({code: 'apex.file_changed', message: 'settings.cfg changed'});
    expect(normalizeIpcError('toast.errors.invalidPort: invalid port', 'add_remote_port'))
      .toEqual({code: 'rdp.invalid_port', message: 'toast.errors.invalidPort: invalid port'});
  });

  it('keeps command, code, details, and cause on IpcCommandError', () => {
    const cause = {code: 'folder_sharing.bad_credentials'};
    const error = new IpcCommandError('connect_folder_share', {
      code: 'folder_sharing.bad_credentials',
      message: 'Access denied',
      details: {account: 'alice'},
    }, cause);

    expect(error.command).toBe('connect_folder_share');
    expect(error.code).toBe('folder_sharing.bad_credentials');
    expect(error.details).toEqual({account: 'alice'});
    expect(error.cause).toBe(cause);
  });

  it('localizes known codes with safe details and falls back for unknown codes', () => {
    const known = {
      code: 'folder_sharing.bad_credentials',
      message: 'Access denied',
      details: {account: 'alice'},
    };
    expect(ipcErrorKey(known)).toBe('folderSharing.errors.bad_credentials');
    expect(ipcErrorKey({code: 'apex.file_changed', message: 'changed'}))
      .toBe('apex.gameSettings.errors.fileChanged');
    expect(ipcErrorKey({code: 'windows.explorer_restart_failed', message: 'failed'}))
      .toBe('windows.errors.explorerRestartFailed');
    expect(ipcErrorKey({code: 'razer_polling.no_response', message: 'no response'}))
      .toBe('razerPolling.errors.noResponse');
    expect(formatIpcError(known)).toBe('Credentials rejected for alice');
    expect(formatIpcError({code: 'apex_q.operation_failed', message: 'native failure'}))
      .toBe('Command failed: native failure');
  });
});
