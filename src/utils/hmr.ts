type CleanupFn = () => void;

const cleanups: CleanupFn[] = [];

export function registerHmrCleanup(fn: CleanupFn) {
  cleanups.push(fn);
}

export function runAllHmrCleanups() {
  while (cleanups.length) {
    try {
      cleanups.pop()?.();
    } catch {
      /* noop */
    }
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    runAllHmrCleanups();
  });
}
