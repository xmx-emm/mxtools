/** 常见显示器刷新率 / 游戏帧率上限预设(Hz FPS 数值一 */
export const common_refresh_rate_presets: number[] = [120, 144, 165, 279];

export function sorted_refresh_rate_presets(values: number[] = common_refresh_rate_presets): number[] {
  return [...values].sort((a, b) => a - b);
}
