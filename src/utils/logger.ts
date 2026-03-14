/**
 * 前端日志：写入 Documents/mxtools/frontend.log
 */
import { invoke } from '@tauri-apps/api/core';

const LOG_LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;

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
  invoke('write_frontend_log', { level, message }).catch(() => {
    // 静默失败，避免递归
  });
}

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

let initialized = false;

export function initFrontendLogger() {
  if (initialized) return;
  initialized = true;
  wrapConsole();
}
