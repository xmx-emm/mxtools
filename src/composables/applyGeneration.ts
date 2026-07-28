/**
 * Apply 代际守卫：过期 poll / 已取消时不应再执行 apply。
 * 从 composable 抽出便于单测。
 */
export function shouldRunApply(opts: {
  currentGeneration: number;
  expectedGeneration: number;
  isApplyRunning: boolean;
}): boolean {
  return (
    opts.isApplyRunning &&
    opts.currentGeneration === opts.expectedGeneration
  );
}

export function nextGeneration(current: number): number {
  return current + 1;
}
