/** 合并同一帧内的多次调度，避免 pointermove / resize 洪水触发同步更新 */
export function createRafScheduler(fn: () => void) {
  let rafId = 0;

  function schedule() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      fn();
    });
  }

  function cancel() {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function flush() {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
    fn();
  }

  return { schedule, cancel, flush };
}
