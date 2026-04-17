/** 常见显示器刷新率 / 游戏帧率上限预设(Hz 与 FPS 数值一致) */
export const common_refresh_rate_presets: number[] = [60, 90, 120, 144, 165, 240, 300];

export function sorted_refresh_rate_presets(values: number[] = common_refresh_rate_presets): number[] {
  return [...values].sort((a, b) => a - b);
}
