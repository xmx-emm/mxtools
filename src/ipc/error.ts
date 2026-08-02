import i18n from '@/i18n/i18n.ts';

export interface IpcErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .replace(/[^A-Za-z0-9_.]/g, '')
    .toLowerCase();
}

function commandDomain(command: string): string {
  if (command.startsWith('apex_q_')) return 'apex_q';
  if (command.includes('folder_sharing') || command.includes('share') || command.startsWith('close_smb')) {
    return 'folder_sharing';
  }
  if (command.includes('input_method') || command.includes('wubi') || command === 'add_us_keyboard') {
    return 'input_method';
  }
  if (command.includes('rdp') || command.includes('remote_port')) return 'rdp';
  if (command.includes('apex')) return 'apex';
  if (command.includes('pubg')) return 'pubg';
  if (command.includes('game_optimizer') || command.includes('game_network')) return 'game_optimizer';
  if (command.includes('port_forwarding')) return 'port_forwarding';
  if (command.includes('windows_user')) return 'windows_user';
  if (command.includes('windows_icon_cache')) return 'windows';
  return 'common';
}

function objectPayload(value: unknown): IpcErrorPayload | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.code !== 'string') return null;
  return {
    code: candidate.code,
    message: typeof candidate.message === 'string' ? candidate.message : candidate.code,
    ...(candidate.details && typeof candidate.details === 'object'
      ? {details: candidate.details as Record<string, unknown>}
      : {}),
  };
}

function legacyCode(value: string, command: string): string {
  const head = value.split(':', 1)[0]?.trim() ?? '';
  if (/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+$/.test(head)) {
    const domain = commandDomain(command);
    const parts = head
      .split('.')
      .filter(part => part !== 'errors')
      .map(toSnakeCase);
    if (parts[0] === 'toast') parts[0] = domain;
    else if (parts[0] !== domain && !['common', 'system'].includes(parts[0] ?? '')) {
      parts.unshift(domain);
    }
    return parts.join('.');
  }
  return `${commandDomain(command)}.operation_failed`;
}

export function normalizeIpcError(error: unknown, command = ''): IpcErrorPayload {
  const direct = objectPayload(error);
  if (direct) return direct;

  if (error instanceof IpcCommandError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? {details: error.details} : {}),
    };
  }

  if (error instanceof Error) {
    const nested = objectPayload((error as Error & {cause?: unknown}).cause);
    if (nested) return nested;
    return {
      code: `${commandDomain(command)}.operation_failed`,
      message: error.message,
    };
  }

  if (typeof error === 'string') {
    try {
      const parsed = objectPayload(JSON.parse(error));
      if (parsed) return parsed;
    } catch {
      // Legacy Tauri commands reject with a plain string.
    }
    return {
      code: legacyCode(error, command),
      message: error,
    };
  }

  return {
    code: `${commandDomain(command)}.unknown`,
    message: String(error ?? ''),
  };
}

function camelCase(value: string): string {
  return value.replace(/_([a-z0-9])/g, (_, character: string) => character.toUpperCase());
}

export const IPC_ERROR_I18N_KEYS: Readonly<Record<string, string>> = {
  'apex.file_changed': 'apex.gameSettings.errors.fileChanged',
  'apex.invalid_value': 'apex.gameSettings.errors.invalidValue',
  'apex.invalid_binding': 'apex.gameSettings.errors.invalidBinding',
  'apex.key_missing': 'apex.gameSettings.errors.keyMissing',
  'apex.verification_failed': 'apex.gameSettings.errors.verifyFailed',
  'apex.running': 'apex.gameSettings.errors.apexRunning',
  'apex.no_changes': 'apex.gameSettings.errors.noChanges',
  'apex.no_restore_selection': 'apex.gameSettings.errors.noRestoreSelection',
  'apex_q.screenshot_folder_not_found': 'ipc.errors.screenshotFolderNotFound',
  'apex_q.screenshot_not_found': 'ipc.errors.screenshotNotFound',
  'apex_q.invalid_distance': 'ipc.errors.invalidDistance',
  'apex_q.invalid_alpha': 'ipc.errors.invalidAlpha',
  'apex_q.ocr_download_failed': 'ipc.errors.ocrDownloadFailed',
  'apex_q.ocr_delete_failed': 'ipc.errors.ocrDeleteFailed',
};

export function ipcErrorKey(error: unknown): string | null {
  const normalized = normalizeIpcError(error);
  const parts = normalized.code.split('.');
  const domain = parts.shift() ?? 'common';
  const reason = parts.pop() ?? 'unknown';
  const group = parts.map(camelCase);
  const candidates: string[] = [];
  const explicit = IPC_ERROR_I18N_KEYS[normalized.code];
  if (explicit) candidates.push(explicit);

  if (domain === 'folder_sharing') {
    candidates.push(`folderSharing.errors.${reason}`);
  } else if (domain === 'input_method') {
    candidates.push(`inputMethod.errors.${camelCase(reason)}`);
  } else if (domain === 'port_forwarding') {
    candidates.push(`portForwarding.errors.${camelCase(reason)}`);
  } else if (domain === 'game_optimizer') {
    candidates.push(`gameOptimizer.errors.${camelCase(reason)}`);
  } else if (domain === 'rdp') {
    candidates.push(`rdp.errors.${camelCase(reason)}`);
  } else if (domain === 'pubg') {
    candidates.push(`pubg.errors.${camelCase(reason)}`);
  } else if (domain === 'apex') {
    if (group.length > 0) {
      candidates.push(`apex.${group.join('.')}.errors.${camelCase(reason)}`);
    }
    candidates.push(`apex.errors.${camelCase(reason)}`);
  } else if (domain === 'windows') {
    candidates.push(`windows.errors.${camelCase(reason)}`);
  }

  return candidates.find(key => i18n.global.te(key)) ?? null;
}

export function formatIpcError(error: unknown): string {
  const normalized = normalizeIpcError(error);
  const key = ipcErrorKey(normalized);
  if (key) {
    return String(i18n.global.t(key, {
      message: normalized.message,
      ...(normalized.details ?? {}),
    }));
  }
  const summary = String(i18n.global.t('ipc.errors.operationFailed'));
  return normalized.message ? `${summary}: ${normalized.message}` : summary;
}

export class IpcCommandError extends Error {
  readonly command: string;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;

  constructor(command: string, payload: IpcErrorPayload, cause?: unknown) {
    super(payload.message);
    this.name = 'IpcCommandError';
    this.command = command;
    this.code = payload.code;
    this.details = payload.details;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }

  override toString(): string {
    return formatIpcError(this);
  }
}
