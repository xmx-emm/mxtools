import {describe, expect, it, vi} from 'vitest';

const i18n = vi.hoisted(() => ({
  te: vi.fn((key: string) => [
    'rdp.errors.protectedAccount',
    'rdp.errors.cannotDeleteCurrentUser',
    'rdp.errors.invalidHost',
  ].includes(key)),
  t: vi.fn((key: string) => key),
}));

vi.mock('@/i18n/i18n.ts', () => ({
  default: {global: i18n},
}));

import {ipcErrorKey, normalizeIpcError} from '@/ipc/error.ts';

describe('Windows user IPC errors', () => {
  it('localizes legacy user.errors codes through the Remote Desktop namespace', () => {
    const protectedAccount = normalizeIpcError('user.errors.protectedAccount', 'delete_windows_user');
    expect(protectedAccount.code).toBe('windows_user.user.protected_account');
    expect(ipcErrorKey(protectedAccount)).toBe('rdp.errors.protectedAccount');

    const currentUser = normalizeIpcError('user.errors.cannotDeleteCurrentUser', 'delete_windows_user');
    expect(ipcErrorKey(currentUser)).toBe('rdp.errors.cannotDeleteCurrentUser');
  });

  it('localizes RDP host validation errors', () => {
    const invalidHost = normalizeIpcError('rdp.errors.invalidHost', 'connect_rdp');
    expect(ipcErrorKey(invalidHost)).toBe('rdp.errors.invalidHost');
  });
});
