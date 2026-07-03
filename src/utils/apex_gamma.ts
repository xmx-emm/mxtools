/** 基准截图对应的 gamma(游戏内亮度 50) */
export const APEX_GAMMA_REFERENCE = 0.949732;

export const APEX_BRIGHTNESS_GAMMA_LUT = [
  { brightness: 0, gamma: 1.75 },
  { brightness: 25, gamma: 1.379032 },
  { brightness: 50, gamma: 0.949732 },
  { brightness: 75, gamma: 0.629032 },
  { brightness: 100, gamma: 0.25 },
] as const;

/**
 * 预览指数 LUT(与亮度分段对应，亮/暗两端单独调校)
 * 100 端已与游戏观感对齐；0 端指数不宜过高，否则预览比实机更暗
 */
export const APEX_BRIGHTNESS_PREVIEW_EXPONENT_LUT = [
  { brightness: 0, exponent: 1.58 },
  { brightness: 25, exponent: 1.30 },
  { brightness: 50, exponent: 1.0 },
  { brightness: 75, exponent: 0.82 },
  { brightness: 100, exponent: 0.617 },
] as const;

/** 写入配置文件的 gamma 小数位 */
export const GAMMA_CONFIG_DECIMALS = 6;
/** 界面显示的 gamma 小数位 */
export const GAMMA_DISPLAY_DECIMALS = 3;

export function roundGamma(gamma: number, decimals = GAMMA_CONFIG_DECIMALS): number {
  const factor = 10 ** decimals;
  return Math.round(gamma * factor) / factor;
}

export function formatGammaDisplay(gamma: number): string {
  return roundGamma(gamma, GAMMA_DISPLAY_DECIMALS).toFixed(GAMMA_DISPLAY_DECIMALS);
}

export function formatGammaConfig(gamma: number): string {
  return roundGamma(gamma, GAMMA_CONFIG_DECIMALS).toFixed(GAMMA_CONFIG_DECIMALS);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function interpolateLut<T extends { brightness: number }>(
  value: number,
  lut: readonly T[],
  getKey: (entry: T) => number,
  getValue: (entry: T) => number,
): number {
  const firstKey = getKey(lut[0]);
  const lastKey = getKey(lut[lut.length - 1]);

  if (firstKey <= lastKey) {
    if (value <= firstKey) return getValue(lut[0]);
    if (value >= lastKey) return getValue(lut[lut.length - 1]);
  } else {
    if (value >= firstKey) return getValue(lut[0]);
    if (value <= lastKey) return getValue(lut[lut.length - 1]);
  }

  for (let i = 0; i < lut.length - 1; i++) {
    const left = lut[i];
    const right = lut[i + 1];
    const leftKey = getKey(left);
    const rightKey = getKey(right);
    const minKey = Math.min(leftKey, rightKey);
    const maxKey = Math.max(leftKey, rightKey);
    if (value >= minKey && value <= maxKey) {
      const t = (value - leftKey) / (rightKey - leftKey);
      return getValue(left) + t * (getValue(right) - getValue(left));
    }
  }

  return getValue(lut[lut.length - 1]);
}

function interpolateBrightnessLut(
  value: number,
  getKey: (entry: (typeof APEX_BRIGHTNESS_GAMMA_LUT)[number]) => number,
  getValue: (entry: (typeof APEX_BRIGHTNESS_GAMMA_LUT)[number]) => number,
): number {
  return interpolateLut(value, APEX_BRIGHTNESS_GAMMA_LUT, getKey, getValue);
}

/** 游戏内亮度 0–100 → setting.gamma */
export function brightnessToGamma(brightness: number): number {
  return roundGamma(
    interpolateBrightnessLut(
      clamp(brightness, 0, 100),
      (e) => e.brightness,
      (e) => e.gamma,
    ),
  );
}

/** setting.gamma → 游戏内亮度 0–100 */
export function gammaToBrightness(gamma: number): number {
  return Math.round(
    interpolateBrightnessLut(
      gamma,
      (e) => e.gamma,
      (e) => e.brightness,
    ),
  );
}

/** 基准图预览校正指数(按亮度分段插值，线性空间幂次) */
export function gammaToPreviewExponent(targetGamma: number): number {
  const brightness = gammaToBrightness(targetGamma);
  return brightnessToPreviewExponent(brightness);
}

/** 游戏内亮度 0–100 → 预览校正指数 */
export function brightnessToPreviewExponent(brightness: number): number {
  return interpolateLut(
    clamp(brightness, 0, 100),
    APEX_BRIGHTNESS_PREVIEW_EXPONENT_LUT,
    (e) => e.brightness,
    (e) => e.exponent,
  );
}
