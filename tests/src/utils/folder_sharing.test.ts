import {describe, expect, it} from 'vitest';
import {folderSharingErrorKey, nextAvailableDrive, normalizeFolderSharingError} from '@/utils/folder_sharing';

describe('folder sharing helpers', () => {
  it('normalizes object, JSON and prefixed errors', () => {
    expect(normalizeFolderSharingError({code: 'credential_conflict', message: '1219'}).code)
      .toBe('credential_conflict');
    expect(normalizeFolderSharingError('{"code":"drive_in_use","message":"85","win32Code":85}'))
      .toEqual({code: 'drive_in_use', message: '85', win32Code: 85});
    expect(normalizeFolderSharingError({
      code: 'folder_sharing.bad_credentials',
      message: 'logon failed',
      details: {win32Code: 1326},
    })).toEqual({code: 'bad_credentials', message: 'logon failed', win32Code: 1326});
    expect(normalizeFolderSharingError('host_unreachable: offline'))
      .toEqual({code: 'host_unreachable', message: 'offline'});
  });

  it('maps only stable error codes to localized keys', () => {
    expect(folderSharingErrorKey({code: 'bad_credentials', message: ''}))
      .toBe('folderSharing.errors.bad_credentials');
    expect(folderSharingErrorKey({code: 'unexpected_internal', message: ''}))
      .toBe('folderSharing.errors.unknown');
  });

  it('chooses the highest free drive letter', () => {
    expect(nextAvailableDrive([
      {localPath: 'Z:', remotePath: '\\\\nas\\a', provider: '', persistent: true, connected: true},
      {localPath: 'Y:', remotePath: '\\\\nas\\b', provider: '', persistent: true, connected: true},
    ])).toBe('X:');
    expect(nextAvailableDrive(
      Array.from({length: 23}, (_, index) => ({
        localPath: `${String.fromCharCode('D'.charCodeAt(0) + index)}:`,
        remotePath: '\\\\nas\\share',
        provider: '',
        persistent: false,
        connected: true,
      })),
    )).toBeNull();
  });
});
