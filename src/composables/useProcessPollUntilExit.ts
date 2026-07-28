import {onUnmounted, ref} from 'vue';
import {nextGeneration} from '@/composables/applyGeneration.ts';

export type UseProcessPollUntilExitOptions = {
  /** 返回 true 表示进程仍在运行 */
  isRunning: () => Promise<boolean>;
  /** 轮询间隔 (ms) */
  pollMs: number;
  /** 进程已退出时回调 */
  onExit: () => void | Promise<void>;
  /** 超过 maxMs 仍未退出时回调（需同时提供 maxMs） */
  onTimeout?: () => void | Promise<void>;
  /** 最长等待时间 (ms)；未设置则一直轮询直到 stop */
  maxMs?: number;
};

/**
 * 轮询直至目标进程退出（或超时），供「关闭进程后再应用」类流程复用。
 */
export function useProcessPollUntilExit(options: UseProcessPollUntilExitOptions) {
  const intervalId = ref<ReturnType<typeof setInterval> | null>(null);
  const startedAt = ref<number | null>(null);
  /** 递增以作废进行中的 async tick，避免 stop/restart 后双回调。 */
  const generation = ref(0);

  function bump() {
    generation.value = nextGeneration(generation.value);
    return generation.value;
  }

  function stop() {
    bump();
    if (intervalId.value != null) {
      clearInterval(intervalId.value);
      intervalId.value = null;
    }
    startedAt.value = null;
  }

  async function tickOnce(expected: number) {
    if (generation.value !== expected) {
      return;
    }
    if (
      options.maxMs != null &&
      startedAt.value != null &&
      Date.now() - startedAt.value >= options.maxMs
    ) {
      if (intervalId.value != null) {
        clearInterval(intervalId.value);
        intervalId.value = null;
      }
      startedAt.value = null;
      if (generation.value === expected) {
        await options.onTimeout?.();
      }
      return;
    }
    const stillRunning = await options.isRunning();
    if (generation.value !== expected) {
      return;
    }
    if (!stillRunning) {
      if (intervalId.value != null) {
        clearInterval(intervalId.value);
        intervalId.value = null;
      }
      startedAt.value = null;
      if (generation.value === expected) {
        await options.onExit();
      }
    }
  }

  function start() {
    if (intervalId.value != null) {
      clearInterval(intervalId.value);
      intervalId.value = null;
    }
    const expected = bump();
    startedAt.value = Date.now();
    const poll = () => {
      void tickOnce(expected).catch((e) => {
        console.warn('process poll failed', e);
      });
    };
    poll();
    intervalId.value = setInterval(poll, options.pollMs);
  }

  onUnmounted(stop);

  return {start, stop};
}
