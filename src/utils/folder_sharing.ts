import type {FolderSharingError, MappedDrive} from '@/types/folder_sharing.ts';

const KNOWN_ERROR_CODES = new Set([
  'access_denied',
  'bad_credentials',
  'connection_has_open_files',
  'conflicting_connection_not_found',
  'credential_conflict',
  'credential_save_failed',
  'drive_in_use',
  'elevation_helper_exited',
  'elevation_pipe_timeout',
  'host_unreachable',
  'invalid_drive',
  'invalid_principal',
  'invalid_server',
  'invalid_share_name',
  'invalid_share_path',
  'invalid_unc_path',
  'network_operation_failed',
  'not_connected',
  'metadata_lock_failed',
  'metadata_write_failed',
  'open_path_failed',
  'principal_required',
  'protected_share',
  'public_profile_confirmation_required',
  'remote_policy_incompatible',
  'share_exists',
  'share_in_use',
  'share_not_found',
  'share_rename_not_supported',
  'unsafe_principal',
  'user_cancelled',
]);

function objectError(value: unknown): FolderSharingError | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.code !== 'string') return null;
  const details = candidate.details && typeof candidate.details === 'object'
    ? candidate.details as Record<string, unknown>
    : null;
  const code = candidate.code.replace(/^folder_sharing\./, '');
  const win32Code = typeof candidate.win32Code === 'number'
    ? candidate.win32Code
    : typeof details?.win32Code === 'number'
      ? details.win32Code
      : undefined;
  return {
    code,
    message: typeof candidate.message === 'string' ? candidate.message : code,
    ...(win32Code !== undefined ? {win32Code} : {}),
  };
}

export function normalizeFolderSharingError(error: unknown): FolderSharingError {
  const direct = objectError(error);
  if (direct) return direct;
  if (typeof error === 'string') {
    try {
      const parsed = objectError(JSON.parse(error));
      if (parsed) return parsed;
    } catch {
      // Tauri can also return a plain backend error string.
    }
    const codePrefix = /^([a-z][a-z0-9_]+):\s*(.*)$/s.exec(error.trim());
    if (codePrefix) {
      return {code: codePrefix[1], message: codePrefix[2] || codePrefix[1]};
    }
    return {code: 'unknown', message: error};
  }
  if (error instanceof Error) return {code: 'unknown', message: error.message};
  return {code: 'unknown', message: String(error ?? '')};
}

export function folderSharingErrorKey(error: unknown): string {
  const normalized = normalizeFolderSharingError(error);
  return KNOWN_ERROR_CODES.has(normalized.code)
    ? `folderSharing.errors.${normalized.code}`
    : 'folderSharing.errors.unknown';
}

export function nextAvailableDrive(mappedDrives: MappedDrive[]): string | null {
  const used = new Set(
    mappedDrives
      .map(drive => drive.localPath.trim().toUpperCase())
      .filter(Boolean),
  );
  for (let code = 'Z'.charCodeAt(0); code >= 'D'.charCodeAt(0); code -= 1) {
    const drive = `${String.fromCharCode(code)}:`;
    if (!used.has(drive)) return drive;
  }
  return null;
}
