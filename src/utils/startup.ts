export const STARTUP_TASK_TIMEOUT_MS = 4_000;

export type StartupTaskResult<T> =
  | {ok: true; value: T}
  | {ok: false; error: unknown};

export async function settleStartupTask<T>(
  task: () => Promise<T>,
  timeoutMs = STARTUP_TASK_TIMEOUT_MS,
): Promise<StartupTaskResult<T>> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Startup task timed out after ${timeoutMs} ms`));
    }, timeoutMs);
  });

  try {
    return {ok: true, value: await Promise.race([task(), timeoutPromise])};
  } catch (error) {
    return {ok: false, error};
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
