/**
 * 前端日志：写入 Documents/mxtools/frontend.log
 * 仅 warn/error 写盘，避免 console.log 洪泛阻塞 IPC。
 */
import {invoke} from '@tauri-apps/api/core';

const LOG_LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;
const BACKEND_LEVELS = new Set(['WARN', 'ERROR']);

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');
}

function sendToBackend(level: string, message: string) {
  if (!BACKEND_LEVELS.has(level)) return;
  invoke('write_frontend_log', { level, message }).catch(() => {
    // 静默失败,避免递归
  });
}

const LOGGER_GUARD_KEY = '__mx_frontend_logger_v1';

function wrapConsole() {
  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  for (const level of LOG_LEVELS) {
    const orig = original[level];
    (console as unknown as Record<string, (...args: unknown[]) => void>)[level] = function (...args: unknown[]) {
      orig(...args);
      const message = formatArgs(args);
      sendToBackend(level.toUpperCase(), message);
    };
  }
}

export function initFrontendLogger() {
  const g = globalThis as { [LOGGER_GUARD_KEY]?: boolean };
  if (g[LOGGER_GUARD_KEY]) return;
  g[LOGGER_GUARD_KEY] = true;
  wrapConsole();
}
