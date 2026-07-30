export type ApexQRoi = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ApexQThetaResult = {
  r: number;
  alpha: number;
  thetaLowOrig: number;
  thetaHighOrig: number;
  thetaLow: number;
  thetaHigh: number;
  recommendedLow: number;
  recommendedHigh: number;
  outOfRange: boolean;
};

export type ApexQCaptureResult = {
  screenshotPath: string;
  alpha: number | null;
  /** ang 偏航（展示用） */
  angYaw: number | null;
  /** ang 滚转（展示用） */
  angRoll: number | null;
  distanceM: number | null;
  showposText: string;
  pingText: string;
  showposPreview: string;
  pingPreview: string;
  showposEngine: string;
  pingEngine: string;
  showposConfidence: number | null;
  pingConfidence: number | null;
  theta: ApexQThetaResult | null;
  error: string | null;
};

export type ApexQOverlayPayload = {
  theta: ApexQThetaResult;
  r: number;
  alpha: number;
  /** 自动消失秒数；0=不自动关 */
  hideSec: number;
};

/**
 * 悬浮窗在某一显示器上的相对几何。
 *
 * rect 使用目标显示器完整物理像素区域的 0–1 比例，因此不受显示器
 * 在虚拟桌面中的负坐标或 DPI 缩放影响。monitorName 为空时由运行时
 * 按保存的分辨率/当前位置选择最接近的显示器。
 */
export type ApexQOverlayPlacement = {
  version: 2;
  monitorName: string | null;
  monitorWidth: number;
  monitorHeight: number;
  rect: ApexQRoi;
};

export type ApexQOverlayInteractionMode = 'display' | 'adjusting';
export type ApexQWindowTarget = 'workspace' | 'ocr' | 'settings' | 'background' | 'overlay';

// These persisted keys and cross-WebView event names are an upgrade contract.
// Keep their legacy values even though source-level naming is now APEX Q.
/** overlay 跨 WebView 的交互模式事件。 */
export const APEX_Q_OVERLAY_INTERACTION_EVENT = 'apex-q-overlay-interaction';
export const APEX_Q_OVERLAY_INTERACTION_STORAGE_KEY = 'mx-apex-q-overlay-interaction';
/** Navigate an existing or newly-created APEX Q workbench to a specific section. */
export const APEX_Q_WINDOW_NAVIGATE_EVENT = 'apex-q-window-navigate';
export const APEX_Q_WINDOW_TARGET_STORAGE_KEY = 'mx-apex-q-window-target';
/** Emitted only after preference persistence and hotkey synchronization settle. */
export const APEX_Q_PREFS_CHANGED_EVENT = 'apex-q-prefs-changed';

/** 自动择优、RapidOCR 本地模型或系统 Windows OCR。 */
export type ApexQOcrEngine = 'auto' | 'rapid' | 'win';

export type ApexQPrefs = {
  setupDone: boolean;
  wizardStep: number;
  screenshotFolder: string;
  hotkey: string;
  delayMs: number;
  enabled: boolean;
  autostart: boolean;
  /** 关闭主窗口时进托盘，而不是退出 */
  closeToTray: boolean;
  /** 仅开机自启时启动不弹主窗口，直接托盘（手动启动始终显示） */
  startInTray: boolean;
  /** 结果悬浮窗自动消失秒数；0 表示不自动消失 */
  overlayHideSec: number;
  /** 小窗口面板不透明度 0.15–1 */
  overlayOpacity: number;
  /**
   * v1：小窗口逻辑像素位置/大小；null 表示用默认。
   * 保留用于旧版本迁移，新代码应优先使用 overlayPlacement。
   */
  overlayX: number | null;
  overlayY: number | null;
  overlayW: number;
  overlayH: number;
  /** v2：相对目标显示器的物理比例几何。 */
  overlayPlacement: ApexQOverlayPlacement | null;
  /** true=显示态锁定；false=允许调整/输入。 */
  overlayLocked: boolean;
  /** OCR 引擎：auto=RapidOCR 优先并由 Windows OCR 兜底。 */
  ocrEngine: ApexQOcrEngine;
  showposConfirmed: boolean;
  usageConfirmed: boolean;
  showposRoi: ApexQRoi;
  pingRoi: ApexQRoi;
};

export type ApexQOverlayGeometry = Pick<
  ApexQPrefs,
  'overlayX' | 'overlayY' | 'overlayW' | 'overlayH' | 'overlayPlacement'
>;

/** Geometry updates emitted after the native overlay is moved or resized. */
export const APEX_Q_OVERLAY_GEOMETRY_EVENT = 'apex-q-overlay-geometry-changed';
/** The overlay emits this after its result listener has been attached. */
export const APEX_Q_OVERLAY_READY_EVENT = 'apex-q-overlay-ready';

export const APEX_Q_STORAGE_KEY = 'mx-apex-q-prefs';
export const APEX_Q_OVERLAY_STORAGE_KEY = 'mx-apex-q-overlay';
/** 小窗口创建参数版本：升级后强制重建透明窗 */
export const APEX_Q_OVERLAY_WINDOW_REV = 'acrylic-nofocus-opacity-v2';
export const APEX_Q_OVERLAY_WINDOW_REV_KEY = 'mx-apex-q-overlay-win-rev';
export const DEFAULT_APEX_Q_HOTKEY = 'F12';
export const DEFAULT_APEX_Q_DELAY_MS = 500;
export const DEFAULT_OVERLAY_HIDE_SEC = 8;
export const DEFAULT_OVERLAY_WIDTH = 220;
export const DEFAULT_OVERLAY_HEIGHT = 124;
export const DEFAULT_OVERLAY_OPACITY = 0.42;
export const MIN_OVERLAY_OPACITY = 0.15;
export const MAX_OVERLAY_OPACITY = 1;
export const MIN_OVERLAY_WIDTH = 180;
export const MIN_OVERLAY_HEIGHT = 96;

/** 标定/无显示器上下文时使用的基准画布，仅用于生成默认比例。 */
export const DEFAULT_OVERLAY_CANVAS_WIDTH = 1920;
export const DEFAULT_OVERLAY_CANVAS_HEIGHT = 1080;
export const DEFAULT_OVERLAY_MARGIN_X = 40;
export const DEFAULT_OVERLAY_MARGIN_Y = 80;

export function defaultApexQOverlayPlacement(
  monitor?: {name?: string | null; width: number; height: number},
  scaleFactor = 1,
): ApexQOverlayPlacement {
  const scale = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  const overlayWidth = DEFAULT_OVERLAY_WIDTH * scale;
  const overlayHeight = DEFAULT_OVERLAY_HEIGHT * scale;
  const monitorWidth = Number.isFinite(monitor?.width) && (monitor?.width ?? 0) > 0
    ? monitor!.width
    : DEFAULT_OVERLAY_CANVAS_WIDTH;
  const monitorHeight = Number.isFinite(monitor?.height) && (monitor?.height ?? 0) > 0
    ? monitor!.height
    : DEFAULT_OVERLAY_CANVAS_HEIGHT;
  const width = Math.min(1, overlayWidth / monitorWidth);
  const height = Math.min(1, overlayHeight / monitorHeight);
  return {
    version: 2,
    monitorName: monitor?.name || null,
    monitorWidth,
    monitorHeight,
    rect: {
      x: Math.max(0, 1 - width - DEFAULT_OVERLAY_MARGIN_X * scale / monitorWidth),
      y: Math.max(0, 1 - height - DEFAULT_OVERLAY_MARGIN_Y * scale / monitorHeight),
      w: width,
      h: height,
    },
  };
}

export function normalizeApexQOverlayPlacement(value: unknown): ApexQOverlayPlacement | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ApexQOverlayPlacement> & {rect?: Partial<ApexQRoi>};
  const mw = Number(raw.monitorWidth);
  const mh = Number(raw.monitorHeight);
  const rect = raw.rect;
  if (raw.version !== 2 || !rect || !Number.isFinite(mw) || !Number.isFinite(mh) || mw <= 0 || mh <= 0) {
    return null;
  }
  const x = Number(rect.x);
  const y = Number(rect.y);
  const w = Number(rect.w);
  const h = Number(rect.h);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  const minW = Math.min(1, MIN_OVERLAY_WIDTH / mw);
  const minH = Math.min(1, MIN_OVERLAY_HEIGHT / mh);
  const safeW = Math.min(1, Math.max(minW, w));
  const safeH = Math.min(1, Math.max(minH, h));
  const clampedX = Math.min(1 - safeW, Math.max(0, x));
  const clampedY = Math.min(1 - safeH, Math.max(0, y));
  return {
    version: 2,
    monitorName: typeof raw.monitorName === 'string' && raw.monitorName ? raw.monitorName : null,
    monitorWidth: mw,
    monitorHeight: mh,
    rect: {
      x: clampedX,
      y: clampedY,
      w: safeW,
      h: safeH,
    },
  };
}

export const DEFAULT_SHOWPOS_ROI: ApexQRoi = {x: 0, y: 0.038, w: 0.105, h: 0.028};
export const DEFAULT_PING_ROI: ApexQRoi = {x: 0.529, y: 0.364, w: 0.115, h: 0.099};

export function defaultApexQPrefs(): ApexQPrefs {
  return {
    setupDone: false,
    wizardStep: 0,
    screenshotFolder: '',
    hotkey: DEFAULT_APEX_Q_HOTKEY,
    delayMs: DEFAULT_APEX_Q_DELAY_MS,
    enabled: false,
    autostart: false,
    closeToTray: false,
    startInTray: false,
    overlayHideSec: DEFAULT_OVERLAY_HIDE_SEC,
    overlayOpacity: DEFAULT_OVERLAY_OPACITY,
    overlayX: null,
    overlayY: null,
    overlayW: DEFAULT_OVERLAY_WIDTH,
    overlayH: DEFAULT_OVERLAY_HEIGHT,
    overlayPlacement: null,
    overlayLocked: true,
    ocrEngine: 'auto',
    showposConfirmed: false,
    usageConfirmed: false,
    showposRoi: {...DEFAULT_SHOWPOS_ROI},
    pingRoi: {...DEFAULT_PING_ROI},
  };
}

function clampOverlaySize(w: number, h: number): {w: number; h: number} {
  return {
    w: Math.max(MIN_OVERLAY_WIDTH, Math.min(640, Math.round(w))),
    h: Math.max(MIN_OVERLAY_HEIGHT, Math.min(480, Math.round(h))),
  };
}

export function loadApexQPrefs(): ApexQPrefs {
  try {
    const raw = localStorage.getItem(APEX_Q_STORAGE_KEY);
    if (!raw) return defaultApexQPrefs();
    const parsed = JSON.parse(raw) as Partial<ApexQPrefs>;
    const prefs = {...defaultApexQPrefs(), ...parsed};
    // 旧默认 showpos ROI（整块四行）→ 迁到只框 ang 行
    const s = prefs.showposRoi;
    if (
      Math.abs(s.x - 0) < 1e-6
      && Math.abs(s.y - 0.009) < 1e-6
      && Math.abs(s.w - 0.12) < 1e-6
      && Math.abs(s.h - 0.08) < 1e-6
    ) {
      prefs.showposRoi = {...DEFAULT_SHOWPOS_ROI};
    }
    // 旧默认 ping ROI（日志证实仍在用）→ 迁到新默认
    const p = prefs.pingRoi;
    if (
      Math.abs(p.x - 0.4) < 1e-6
      && Math.abs(p.y - 0.42) < 1e-6
      && Math.abs(p.w - 0.2) < 1e-6
      && Math.abs(p.h - 0.14) < 1e-6
    ) {
      prefs.pingRoi = {...DEFAULT_PING_ROI};
    }
    const size = clampOverlaySize(
      Number.isFinite(prefs.overlayW) ? prefs.overlayW : DEFAULT_OVERLAY_WIDTH,
      Number.isFinite(prefs.overlayH) ? prefs.overlayH : DEFAULT_OVERLAY_HEIGHT,
    );
    prefs.overlayW = size.w;
    prefs.overlayH = size.h;
    if (prefs.overlayX != null && !Number.isFinite(prefs.overlayX)) prefs.overlayX = null;
    if (prefs.overlayY != null && !Number.isFinite(prefs.overlayY)) prefs.overlayY = null;
    prefs.overlayPlacement = normalizeApexQOverlayPlacement(prefs.overlayPlacement);
    if (typeof prefs.overlayLocked !== 'boolean') prefs.overlayLocked = true;
    if (!['auto', 'rapid', 'win'].includes(prefs.ocrEngine)) {
      prefs.ocrEngine = 'auto';
    }
    const op = Number(prefs.overlayOpacity);
    prefs.overlayOpacity = Number.isFinite(op)
      ? Math.min(MAX_OVERLAY_OPACITY, Math.max(MIN_OVERLAY_OPACITY, op))
      : DEFAULT_OVERLAY_OPACITY;
    return prefs;
  } catch {
    return defaultApexQPrefs();
  }
}

/** 重置小窗口位置与大小为默认（运行时会按当前显示器工作区摆放） */
export function resetApexQOverlayGeometry(prefs: ApexQPrefs): ApexQPrefs {
  prefs.overlayX = null;
  prefs.overlayY = null;
  prefs.overlayW = DEFAULT_OVERLAY_WIDTH;
  prefs.overlayH = DEFAULT_OVERLAY_HEIGHT;
  prefs.overlayPlacement = null;
  saveApexQPrefs(prefs);
  return prefs;
}

export function saveApexQPrefs(prefs: ApexQPrefs) {
  localStorage.setItem(APEX_Q_STORAGE_KEY, JSON.stringify(prefs));
}
