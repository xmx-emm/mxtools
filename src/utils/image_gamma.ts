const SRGB_LINEAR_THRESHOLD = 0.04045;
const LINEAR_SRGB_THRESHOLD = 0.0031308;

type SourceCacheEntry = {
  sourceData: ImageData;
  width: number;
  height: number;
};

const sourceCache = new Map<string, SourceCacheEntry>();

function cacheKey(src: string, maxWidth: number): string {
  return `${src}@${maxWidth}`;
}

function srgbToLinear(v: number): number {
  return v <= SRGB_LINEAR_THRESHOLD ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(v: number): number {
  const clamped = Math.max(0, Math.min(1, v));
  return clamped <= LINEAR_SRGB_THRESHOLD
    ? clamped * 12.92
    : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function buildChannelLut(exponent: number): Uint8Array {
  const lut = new Uint8Array(256);
  const darken = exponent > 1;

  for (let i = 0; i < 256; i++) {
    let v = i / 255;
    if (darken) {
      v = v ** exponent;
    } else {
      v = srgbToLinear(v);
      v = v ** exponent;
      v = linearToSrgb(v);
    }
    lut[i] = Math.round(Math.max(0, Math.min(1, v)) * 255);
  }

  return lut;
}

async function loadSourceEntry(src: string, maxWidth: number): Promise<SourceCacheEntry> {
  const key = cacheKey(src, maxWidth);
  const cached = sourceCache.get(key);
  if (cached) return cached;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = src;
  });

  let width = img.naturalWidth;
  let height = img.naturalHeight;
  if (maxWidth > 0 && width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.drawImage(img, 0, 0, width, height);
  const entry: SourceCacheEntry = {
    sourceData: ctx.getImageData(0, 0, width, height),
    width,
    height,
  };
  sourceCache.set(key, entry);
  return entry;
}

/** 可复用的伽马预览处理器：共享原图缓存，LUT 查表更新 canvas */
export class GammaImagePreview {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private sourceData: ImageData | null = null;
  private outputData: ImageData | null = null;
  private loadedKey = '';
  private lastExponent = Number.NaN;
  private readonly lutCache = new Map<string, Uint8Array>();

  constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }
    this.ctx = ctx;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  isLoaded(): boolean {
    return this.sourceData !== null;
  }

  getLoadedKey(): string {
    return this.loadedKey;
  }

  private lutKey(exponent: number): string {
    return exponent.toFixed(3);
  }

  private getLut(exponent: number): Uint8Array {
    const key = this.lutKey(exponent);
    let lut = this.lutCache.get(key);
    if (!lut) {
      lut = buildChannelLut(exponent);
      this.lutCache.set(key, lut);
      if (this.lutCache.size > 64) {
        const oldest = this.lutCache.keys().next().value;
        if (oldest) this.lutCache.delete(oldest);
      }
    }
    return lut;
  }

  async loadFromSrc(src: string, maxWidth = 896): Promise<void> {
    const key = cacheKey(src, maxWidth);
    if (this.loadedKey === key && this.sourceData) return;

    const entry = await loadSourceEntry(src, maxWidth);
    this.canvas.width = entry.width;
    this.canvas.height = entry.height;
    this.sourceData = entry.sourceData;
    this.outputData = this.ctx.createImageData(entry.width, entry.height);
    this.loadedKey = key;
    this.lastExponent = Number.NaN;
    this.lutCache.clear();
  }

  applyExponent(exponent: number): HTMLCanvasElement {
    if (!this.sourceData || !this.outputData) {
      return this.canvas;
    }

    if (exponent === this.lastExponent) {
      return this.canvas;
    }
    this.lastExponent = exponent;

    if (exponent === 1) {
      this.ctx.putImageData(this.sourceData, 0, 0);
      return this.canvas;
    }

    const lut = this.getLut(exponent);
    const src = this.sourceData.data;
    const dst = this.outputData.data;

    for (let i = 0; i < src.length; i += 4) {
      dst[i] = lut[src[i]];
      dst[i + 1] = lut[src[i + 1]];
      dst[i + 2] = lut[src[i + 2]];
      dst[i + 3] = src[i + 3];
    }

    this.ctx.putImageData(this.outputData, 0, 0);
    return this.canvas;
  }

  dispose(): void {
    this.sourceData = null;
    this.outputData = null;
    this.loadedKey = '';
    this.lastExponent = Number.NaN;
    this.lutCache.clear();
  }
}
