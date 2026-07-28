import {
  isRegistered,
  register,
  unregister,
  type ShortcutEvent,
} from '@tauri-apps/plugin-global-shortcut';
import {WebviewWindow} from '@tauri-apps/api/webviewWindow';
import {
  LogicalPosition,
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
} from '@tauri-apps/api/dpi';
import {
  availableMonitors,
  currentMonitor,
  Effect,
  getCurrentWindow,
  monitorFromPoint,
  type Monitor,
} from '@tauri-apps/api/window';
import {emit, listen, type UnlistenFn} from '@tauri-apps/api/event';
import {
  alterQFromLatestScreenshot,
  alterQNormalizePath,
} from '@/ipc/commands.ts';
import type {
  AlterQCaptureResult,
  AlterQOverlayGeometry,
  AlterQOverlayInteractionMode,
  AlterQOverlayPayload,
  AlterQPrefs,
  AlterQThetaResult,
} from '@/types/alter_q.ts';
import {
  ALTER_Q_OVERLAY_INTERACTION_EVENT,
  ALTER_Q_OVERLAY_INTERACTION_STORAGE_KEY,
  ALTER_Q_OVERLAY_GEOMETRY_EVENT,
  ALTER_Q_OVERLAY_READY_EVENT,
  ALTER_Q_OVERLAY_STORAGE_KEY,
  ALTER_Q_OVERLAY_WINDOW_REV,
  ALTER_Q_OVERLAY_WINDOW_REV_KEY,
  ALTER_Q_PREFS_CHANGED_EVENT,
  DEFAULT_OVERLAY_MARGIN_X,
  DEFAULT_OVERLAY_MARGIN_Y,
  DEFAULT_OVERLAY_HEIGHT,
  DEFAULT_OVERLAY_WIDTH,
  MIN_OVERLAY_HEIGHT,
  MIN_OVERLAY_WIDTH,
  loadAlterQPrefs,
  saveAlterQPrefs,
} from '@/types/alter_q.ts';
import {registerHmrCleanup} from '@/utils/hmr.ts';

const OVERLAY_LABEL = 'alter-q-overlay-window';
const MAIN_WINDOW_LABEL = 'main';
const PREFS_SYNC_EVENT = 'alter-q-prefs-sync-request';
const PREFS_SYNC_RESULT_EVENT = 'alter-q-prefs-sync-result';
const CAPTURE_RESULT_EVENT = 'alter-q-capture-result';
const OVERLAY_SHOW_REQUEST_EVENT = 'alter-q-overlay-show-request';
const CAPTURE_RESULT_STORAGE_KEY = 'mx-alter-q-capture-result';
const CAPTURE_RESULT_MAX_AGE_MS = 30_000;
const HOTKEY_DEBOUNCE_MS = 350;
const PREFS_SYNC_TIMEOUT_MS = 5_000;
const OVERLAY_READY_TIMEOUT_MS = 3_000;
// Only absorb same-tick duplicate calls; a real second capture should reset
// the hide timer even when OCR happens to produce identical values.
const OVERLAY_DEDUPE_MS = 500;
const MAX_OVERLAY_WIDTH = 640;
const MAX_OVERLAY_HEIGHT = 480;
const OVERLAY_GEOMETRY_SAMPLE_STORAGE_KEY = 'mx-alter-q-overlay-geometry-sample';
const OVERLAY_GEOMETRY_CLOCK_SKEW_MS = 10_000;
const HOTKEY_RUNTIME_KEY = '__mx_alter_q_hotkey_runtime_v1';
const CAPTURE_RUNTIME_KEY = '__mx_alter_q_capture_runtime_v1';

type AlterQHotkeyRuntime = {
  registeredHotkey: string | null;
  /** true once this app instance has reconciled the native registration. */
  known: boolean;
  dispatch: ((event?: ShortcutEvent) => void) | null;
  /** Keep async registration serialized across Vite HMR module instances. */
  hotkeySyncQueue: Promise<void>;
  /** A native shortcut callback can outlive the module that created it. */
  captureInFlight: boolean;
};

function getAlterQHotkeyRuntime(): AlterQHotkeyRuntime {
  const scope = globalThis as typeof globalThis & {
    [HOTKEY_RUNTIME_KEY]?: AlterQHotkeyRuntime;
  };
  const runtime = scope[HOTKEY_RUNTIME_KEY] ??= {
    registeredHotkey: null,
    known: false,
    dispatch: null,
    hotkeySyncQueue: Promise.resolve(),
    captureInFlight: false,
  };
  // Older HMR instances may have created the runtime before these fields
  // existed. Initialize them in place so pending work remains shared.
  runtime.hotkeySyncQueue ??= Promise.resolve();
  runtime.captureInFlight ??= false;
  return runtime;
}

const hotkeyRuntime = getAlterQHotkeyRuntime();

type AlterQCaptureRuntime = {
  lastCaptureResultId: string | null;
  lastCaptureResultEmittedAt: number;
};

function getAlterQCaptureRuntime(): AlterQCaptureRuntime {
  const scope = globalThis as typeof globalThis & {
    [CAPTURE_RUNTIME_KEY]?: AlterQCaptureRuntime;
  };
  return scope[CAPTURE_RUNTIME_KEY] ??= {
    lastCaptureResultId: null,
    lastCaptureResultEmittedAt: 0,
  };
}

const captureRuntime = getAlterQCaptureRuntime();

// Keep the local alias for the current module, while mirroring it into a
// stable runtime object so Vite HMR can reconcile registrations created by an
// earlier module instance.
let registeredHotkey: string | null = hotkeyRuntime.registeredHotkey;

function setRegisteredHotkey(value: string | null) {
  registeredHotkey = value;
  hotkeyRuntime.registeredHotkey = value;
  hotkeyRuntime.known = true;
}
let onResult: ((r: AlterQCaptureResult) => void) | null = null;
let prefsSyncUnlisten: UnlistenFn | null = null;
let prefsSyncListenerStarting: Promise<void> | null = null;
let captureResultUnlisten: UnlistenFn | null = null;
let captureResultListenerStarting: Promise<void> | null = null;
let overlayShowRequestUnlisten: UnlistenFn | null = null;
let overlayShowRequestListenerStarting: Promise<void> | null = null;
let overlayPresentationQueue: Promise<void> = Promise.resolve();
let lastHotkeyPressedAt = Number.NEGATIVE_INFINITY;
let lastHotkeyPressedShortcut: string | null = null;
let captureSequence = 0;
let prefsSyncSequence = 0;
let lastOverlayFingerprint: string | null = null;
let lastOverlayShownAt = 0;
let lastSyncedPrefs: AlterQPrefs | null = null;
let childHotkeySyncHealthy = false;
let overlayCreationPromise: Promise<WebviewWindow> | null = null;
let overlayRevisionPromise: Promise<void> | null = null;
let overlayRevisionEnsured = false;
let overlayGeometryPersistSequence = 0;
let overlayShowSequence = 0;
let overlayPresentationSequence = 0;
const captureOverlayDedupe = new Map<string, {
  fingerprint: string;
  shown: boolean;
  shownAt: number | null;
  expiresAt: number;
}>();

type CaptureResultEnvelope = {
  id: string;
  emittedAt: number;
  result: AlterQCaptureResult;
};

type OverlayShowRequest = {
  id: string;
  issuedAt: number;
  payload: AlterQOverlayPayload;
};

type AlterQHotkeyPrefs = Pick<AlterQPrefs, 'enabled' | 'setupDone' | 'hotkey'>;

type PrefsSyncRequest = {
  id: string;
  desired: AlterQHotkeyPrefs;
};

type PrefsSyncResult = {
  id: string;
  ok: boolean;
  error?: string;
};

function hotkeyPrefsSnapshot(prefs: AlterQPrefs): AlterQHotkeyPrefs {
  return {
    enabled: prefs.enabled,
    setupDone: prefs.setupDone,
    hotkey: prefs.hotkey,
  };
}

function sameHotkeyPrefs(left: AlterQHotkeyPrefs, right: AlterQHotkeyPrefs) {
  return left.enabled === right.enabled
    && left.setupDone === right.setupDone
    && left.hotkey === right.hotkey;
}

function parsePrefsSyncRequest(value: unknown): PrefsSyncRequest | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<PrefsSyncRequest> & {desired?: Partial<AlterQHotkeyPrefs>};
  if (
    typeof raw.id !== 'string'
    || !raw.id
    || typeof raw.desired?.enabled !== 'boolean'
    || typeof raw.desired.setupDone !== 'boolean'
    || typeof raw.desired.hotkey !== 'string'
  ) {
    return null;
  }
  return raw as PrefsSyncRequest;
}

function parsePrefsSyncResult(value: unknown): PrefsSyncResult | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<PrefsSyncResult>;
  if (typeof raw.id !== 'string' || !raw.id || typeof raw.ok !== 'boolean') return null;
  return {
    id: raw.id,
    ok: raw.ok,
    error: typeof raw.error === 'string' ? raw.error : undefined,
  };
}

async function requestAlterQPrefsSync(desired: AlterQHotkeyPrefs) {
  const request: PrefsSyncRequest = {
    id: `${Date.now()}-${getCurrentWindow().label}-${++prefsSyncSequence}`,
    desired,
  };
  let settle: ((result: PrefsSyncResult) => void) | null = null;
  const resultPromise = new Promise<PrefsSyncResult>((resolve) => {
    settle = resolve;
  });
  const unlisten = await listen<PrefsSyncResult>(PREFS_SYNC_RESULT_EVENT, (event) => {
    const result = parsePrefsSyncResult(event.payload);
    if (result?.id === request.id) settle?.(result);
  });
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    await emit(PREFS_SYNC_EVENT, request);
    const result = await Promise.race([
      resultPromise,
      new Promise<PrefsSyncResult>((resolve) => {
        timeout = setTimeout(() => resolve({
          id: request.id,
          ok: false,
          error: 'ALTER_Q_PREFS_SYNC_TIMEOUT',
        }), PREFS_SYNC_TIMEOUT_MS);
      }),
    ]);
    if (!result.ok) throw new Error(result.error || 'ALTER_Q_HOTKEY_REGISTER_FAILED');
  } finally {
    if (timeout != null) clearTimeout(timeout);
    unlisten();
  }
}

function overlayFingerprint(
  theta: AlterQThetaResult,
  r: number,
  alpha: number,
) {
  return [
    theta.r,
    theta.alpha,
    r,
    alpha,
    theta.thetaLow,
    theta.thetaHigh,
  ].map((value) => Number(value).toFixed(6)).join(':');
}

function nextOverlayShowRequest(payload: AlterQOverlayPayload): OverlayShowRequest {
  const issuedAt = Date.now();
  overlayShowSequence = (overlayShowSequence + 1) % 1_000_000;
  return {
    id: `${issuedAt}-${getCurrentWindow().label}-${overlayShowSequence}`,
    issuedAt,
    payload,
  };
}

function parseOverlayShowRequest(value: unknown): OverlayShowRequest | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<OverlayShowRequest>;
  const payload = raw.payload as Partial<AlterQOverlayPayload> | undefined;
  const theta = payload?.theta as Partial<AlterQThetaResult> | undefined;
  if (
    typeof raw.id !== 'string'
    || !raw.id
    || !Number.isFinite(raw.issuedAt)
    || !payload
    || !theta
    || ![
      payload.r,
      payload.alpha,
      payload.hideSec,
      theta.r,
      theta.alpha,
      theta.thetaLow,
      theta.thetaHigh,
      theta.recommendedLow,
      theta.recommendedHigh,
    ].every(Number.isFinite)
  ) {
    return null;
  }
  return raw as OverlayShowRequest;
}

function captureResultFingerprint(result: AlterQCaptureResult): string | null {
  if (!result.theta) return null;
  return overlayFingerprint(
    result.theta,
    result.distanceM ?? result.theta.r,
    result.alpha ?? result.theta.alpha,
  );
}

function rememberCaptureEnvelope(envelope: CaptureResultEnvelope) {
  const fingerprint = captureResultFingerprint(envelope.result);
  if (!fingerprint) return;
  const now = Date.now();
  for (const [id, entry] of captureOverlayDedupe) {
    if (entry.expiresAt <= now) captureOverlayDedupe.delete(id);
  }
  if (!captureOverlayDedupe.has(envelope.id)) {
    captureOverlayDedupe.set(envelope.id, {
      fingerprint,
      shown: false,
      shownAt: null,
      expiresAt: now + CAPTURE_RESULT_MAX_AGE_MS,
    });
  }
}

function claimCaptureOverlay(fingerprint: string): 'claimed' | 'duplicate' | 'none' {
  const now = Date.now();
  for (const [id, entry] of captureOverlayDedupe) {
    if (entry.expiresAt <= now) {
      captureOverlayDedupe.delete(id);
      continue;
    }
    if (entry.fingerprint !== fingerprint) continue;
    if (entry.shown) {
      // Only suppress the near-concurrent second delivery. A later manual
      // recalculation with the same numeric result must still refresh the
      // overlay and its hide timer.
      if (entry.shownAt != null && now - entry.shownAt < OVERLAY_DEDUPE_MS) {
        return 'duplicate';
      }
      captureOverlayDedupe.delete(id);
      continue;
    }
    entry.shown = true;
    entry.shownAt = now;
    return 'claimed';
  }
  return 'none';
}

function ownsAlterQHotkey() {
  return getCurrentWindow().label === MAIN_WINDOW_LABEL;
}

function nextCaptureResultId() {
  captureSequence = (captureSequence + 1) % 1_000_000;
  return `${Date.now()}-${captureSequence}`;
}

function parseCaptureResultEnvelope(value: unknown): CaptureResultEnvelope | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<CaptureResultEnvelope> & {result?: unknown};
  if (!raw.result || typeof raw.result !== 'object') return null;
  if (typeof raw.id !== 'string' || !raw.id) return null;
  const emittedAt = Number(raw.emittedAt);
  if (!Number.isFinite(emittedAt) || emittedAt <= 0) return null;
  return {
    id: raw.id,
    emittedAt,
    result: raw.result as AlterQCaptureResult,
  };
}

function captureResultIdIsOlder(left: string, right: string) {
  const leftSequence = Number(left.slice(left.lastIndexOf('-') + 1));
  const rightSequence = Number(right.slice(right.lastIndexOf('-') + 1));
  if (Number.isFinite(leftSequence) && Number.isFinite(rightSequence)) {
    return leftSequence < rightSequence;
  }
  return left < right;
}

function readStoredCaptureResult(): CaptureResultEnvelope | null {
  try {
    const raw = localStorage.getItem(CAPTURE_RESULT_STORAGE_KEY);
    return raw ? parseCaptureResultEnvelope(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function persistCaptureResult(envelope: CaptureResultEnvelope) {
  try {
    localStorage.setItem(CAPTURE_RESULT_STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // A large OCR preview can exceed the WebView quota. Keep a compact
    // fallback so the result itself remains recoverable in the other window.
    try {
      localStorage.setItem(
        CAPTURE_RESULT_STORAGE_KEY,
        JSON.stringify({
          ...envelope,
          result: {
            ...envelope.result,
            showposPreview: '',
            pingPreview: '',
          },
        }),
      );
    } catch {
      /* localStorage is optional; the live Tauri event is still delivered. */
    }
  }
}

function persistOverlayPayload(payload: AlterQOverlayPayload) {
  try {
    localStorage.setItem(ALTER_Q_OVERLAY_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // The live Tauri event is still enough for an already-open overlay.
    // A newly-created overlay can recover the result from its event payload.
  }
}

function deliverCaptureResult(envelope: CaptureResultEnvelope, force = false) {
  if (!onResult) return;
  if (!force && envelope.id === captureRuntime.lastCaptureResultId) return;
  // A live event and storage recovery can arrive in either order. Never let
  // an older persisted envelope replace a result that was already displayed.
  if (
    !force
    && envelope.emittedAt < captureRuntime.lastCaptureResultEmittedAt
  ) return;
  if (
    !force
    && envelope.emittedAt === captureRuntime.lastCaptureResultEmittedAt
    && captureRuntime.lastCaptureResultId != null
    && captureResultIdIsOlder(envelope.id, captureRuntime.lastCaptureResultId)
  ) return;
  captureRuntime.lastCaptureResultId = envelope.id;
  captureRuntime.lastCaptureResultEmittedAt = Math.max(
    captureRuntime.lastCaptureResultEmittedAt,
    envelope.emittedAt,
  );
  try {
    onResult(envelope.result);
  } catch (e) {
    console.warn('alter-q capture result handler failed', e);
  }
}

async function ensureCaptureResultListener() {
  if (ownsAlterQHotkey() || captureResultUnlisten) return;
  if (!captureResultListenerStarting) {
    let disposed = false;
    registerHmrCleanup(() => {
      disposed = true;
      captureResultUnlisten?.();
      captureResultUnlisten = null;
      captureResultListenerStarting = null;
    });
    captureResultListenerStarting = listen<CaptureResultEnvelope>(CAPTURE_RESULT_EVENT, (event) => {
      const envelope = parseCaptureResultEnvelope(event.payload);
      if (!envelope) return;
      rememberCaptureEnvelope(envelope);
      persistCaptureResult(envelope);
      deliverCaptureResult(envelope);
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      captureResultUnlisten = unlisten;
    }).finally(() => {
      if (!captureResultUnlisten) captureResultListenerStarting = null;
    });
  }
  await captureResultListenerStarting;
}

async function recoverStoredCaptureResult() {
  const envelope = readStoredCaptureResult();
  if (!envelope) return;
  const age = Date.now() - envelope.emittedAt;
  if (age < -5_000 || age > CAPTURE_RESULT_MAX_AGE_MS) return;
  rememberCaptureEnvelope(envelope);
  deliverCaptureResult(envelope);
}

export function setAlterQResultHandler(handler: ((r: AlterQCaptureResult) => void) | null) {
  onResult = handler;
  if (handler && !ownsAlterQHotkey()) {
    void ensureCaptureResultListener()
      .then(() => recoverStoredCaptureResult())
      .catch((e) => console.warn('alter-q capture result listener failed', e));
  }
}

export async function normalizeAlterQFolder(path: string): Promise<string> {
  try {
    return await alterQNormalizePath({path});
  } catch {
    return path.replace(/\//g, '\\').replace(/\\{2,}/g, '\\');
  }
}

type OverlayGeomWin = {
  setSize: (size: LogicalSize | PhysicalSize) => Promise<void>;
  setSizeConstraints: (c: {
    minWidth: number;
    minHeight: number;
    maxWidth: number;
    maxHeight: number;
  }) => Promise<void>;
  setPosition: (pos: LogicalPosition | PhysicalPosition) => Promise<void>;
  setEffects: (effects: {effects: Effect[]; color?: [number, number, number, number]}) => Promise<void>;
  scaleFactor: () => Promise<number>;
  outerPosition: () => Promise<{x: number; y: number}>;
  innerSize: () => Promise<{width: number; height: number}>;
  center: () => Promise<void>;
};

type OverlayGeometry = {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  monitor: Monitor | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finitePositive(value: number | null | undefined, fallback: number) {
  return Number.isFinite(value) && (value ?? 0) > 0 ? Number(value) : fallback;
}

function overlayGeometrySnapshot(prefs: AlterQPrefs): AlterQOverlayGeometry {
  return {
    overlayX: prefs.overlayX,
    overlayY: prefs.overlayY,
    overlayW: prefs.overlayW,
    overlayH: prefs.overlayH,
    overlayPlacement: prefs.overlayPlacement,
  };
}

function sameOverlayGeometry(left: AlterQPrefs, right: AlterQPrefs) {
  return left.overlayX === right.overlayX
    && left.overlayY === right.overlayY
    && left.overlayW === right.overlayW
    && left.overlayH === right.overlayH
    && JSON.stringify(left.overlayPlacement) === JSON.stringify(right.overlayPlacement);
}

async function broadcastOverlayGeometry(prefs: AlterQPrefs) {
  try {
    await emit(ALTER_Q_OVERLAY_GEOMETRY_EVENT, overlayGeometrySnapshot(prefs));
  } catch {
    /* Other WebViews reload the same values from storage when they reopen. */
  }
}

async function broadcastAlterQPrefs(prefs: AlterQPrefs) {
  try {
    await emit(ALTER_Q_PREFS_CHANGED_EVENT, {
      source: getCurrentWindow().label,
      prefs,
    });
  } catch {
    /* Other WebViews reload persisted preferences when they reopen. */
  }
}

export type AlterQMonitorDescriptor = {
  name: string | null;
  position: {x: number; y: number};
  size: {width: number; height: number};
  scaleFactor: number;
};

function monitorLogicalOrigin(monitor: AlterQMonitorDescriptor) {
  const scale = finitePositive(monitor.scaleFactor, 1);
  return {x: monitor.position.x / scale, y: monitor.position.y / scale};
}

function monitorContainsLogicalPoint(monitor: AlterQMonitorDescriptor, x: number, y: number) {
  const scale = finitePositive(monitor.scaleFactor, 1);
  const origin = monitorLogicalOrigin(monitor);
  const width = monitor.size.width / scale;
  const height = monitor.size.height / scale;
  return x >= origin.x && x < origin.x + width && y >= origin.y && y < origin.y + height;
}

function monitorContainsPhysicalPoint(monitor: AlterQMonitorDescriptor, x: number, y: number) {
  return x >= monitor.position.x
    && x < monitor.position.x + monitor.size.width
    && y >= monitor.position.y
    && y < monitor.position.y + monitor.size.height;
}

function sameMonitor(left: AlterQMonitorDescriptor, right: AlterQMonitorDescriptor) {
  return left.name === right.name
    && left.position.x === right.position.x
    && left.position.y === right.position.y;
}

function closestMonitorBySavedSize<T extends AlterQMonitorDescriptor>(
  monitors: T[],
  prefs: AlterQPrefs,
) {
  const placement = prefs.overlayPlacement;
  if (!placement || !monitors.length) return monitors[0] ?? null;
  return [...monitors].sort((left, right) => {
    const leftDelta = Math.abs(left.size.width - placement.monitorWidth)
      + Math.abs(left.size.height - placement.monitorHeight);
    const rightDelta = Math.abs(right.size.width - placement.monitorWidth)
      + Math.abs(right.size.height - placement.monitorHeight);
    return leftDelta - rightDelta;
  })[0] ?? null;
}

/** Shared monitor resolver for both native placement and the placement UI. */
export function selectAlterQOverlayMonitor<T extends AlterQMonitorDescriptor>(
  monitors: T[],
  prefs: AlterQPrefs,
  fallback: T | null = null,
): T | null {
  if (!monitors.length) return null;
  // Mixed-DPI virtual desktops can make logical monitor bounds overlap. Only
  // trust legacy coordinates when they identify one monitor unambiguously;
  // otherwise use the saved physical dimensions and live monitor as fallbacks.
  const legacyMatches = prefs.overlayX != null && prefs.overlayY != null
    ? monitors.filter((monitor) =>
      monitorContainsLogicalPoint(monitor, prefs.overlayX!, prefs.overlayY!),
    )
    : [];
  const legacy = legacyMatches.length === 1 ? legacyMatches[0]! : null;
  const preferredName = prefs.overlayPlacement?.monitorName;
  const named = preferredName
    ? monitors.filter((monitor) => monitor.name === preferredName)
    : [];
  if (named.length === 1) return named[0]!;
  if (named.length > 1) {
    const sameSizedNamed = prefs.overlayPlacement
      ? named.filter((monitor) =>
        monitor.size.width === prefs.overlayPlacement!.monitorWidth
        && monitor.size.height === prefs.overlayPlacement!.monitorHeight,
      )
      : [];
    if (sameSizedNamed.length === 1) return sameSizedNamed[0]!;
    if (legacy && sameSizedNamed.some((monitor) => sameMonitor(monitor, legacy))) {
      return legacy;
    }
    if (fallback && sameSizedNamed.some((monitor) => sameMonitor(monitor, fallback))) {
      return fallback;
    }
    if (sameSizedNamed.length > 1) return sameSizedNamed[0]!;
    if (fallback && named.some((monitor) => sameMonitor(monitor, fallback))) return fallback;
    return closestMonitorBySavedSize(named, prefs);
  }
  if (prefs.overlayPlacement) {
    const sameSized = monitors.filter((monitor) =>
      monitor.size.width === prefs.overlayPlacement!.monitorWidth
      && monitor.size.height === prefs.overlayPlacement!.monitorHeight,
    );
    if (sameSized.length === 1) return sameSized[0]!;
    if (legacy && sameSized.some((monitor) => sameMonitor(monitor, legacy))) {
      return legacy;
    }
    if (fallback && sameSized.some((monitor) => sameMonitor(monitor, fallback))) {
      return fallback;
    }
    if (sameSized.length > 1) return sameSized[0]!;
  }
  if (legacy) return legacy;
  if (fallback) return fallback;
  return closestMonitorBySavedSize(monitors, prefs);
}

async function resolveOverlayMonitor(
  prefs: AlterQPrefs,
  win?: OverlayGeomWin | null,
): Promise<Monitor | null> {
  let monitors: Monitor[] = [];
  try {
    monitors = await availableMonitors();
  } catch {
    /* A browser preview or an older runtime may not expose monitor APIs. */
  }
  if (!monitors.length) {
    if (win) {
      try {
        const position = await win.outerPosition();
        const size = await win.innerSize();
        return await monitorFromPoint(
          position.x + size.width / 2,
          position.y + size.height / 2,
        );
      } catch {
        return null;
      }
    }
    try {
      return await currentMonitor();
    } catch {
      return null;
    }
  }

  let byWindow: Monitor | null = null;

  if (win) {
    try {
      const position = await win.outerPosition();
      const size = await win.innerSize();
      const centerX = position.x + size.width / 2;
      const centerY = position.y + size.height / 2;
      const byBounds = monitors.find((monitor) =>
        monitorContainsPhysicalPoint(monitor, centerX, centerY),
      );
      const byPoint = byBounds ?? await monitorFromPoint(centerX, centerY);
      if (byPoint) {
        const exact = monitors.find((monitor) =>
          sameMonitor(monitor, byPoint),
        );
        byWindow = exact ?? byPoint;
      }
    } catch {
      /* Continue with the focused monitor. */
    }
  }

  if (!win) {
    try {
      const current = await currentMonitor();
      if (current) {
        byWindow = monitors.find((monitor) => sameMonitor(monitor, current))
          ?? monitors.find((monitor) => monitor.name === current.name)
          ?? null;
      }
    } catch {
      /* Use saved dimensions or the first monitor as a deterministic fallback. */
    }
  }
  return selectAlterQOverlayMonitor(monitors, prefs, byWindow);
}

async function overlayGeometryFromPrefs(
  prefs: AlterQPrefs,
  win?: OverlayGeomWin | null,
): Promise<OverlayGeometry> {
  const monitor = await resolveOverlayMonitor(prefs, win);
  const legacyWidth = clamp(
    finitePositive(prefs.overlayW, DEFAULT_OVERLAY_WIDTH),
    MIN_OVERLAY_WIDTH,
    MAX_OVERLAY_WIDTH,
  );
  const legacyHeight = clamp(
    finitePositive(prefs.overlayH, DEFAULT_OVERLAY_HEIGHT),
    MIN_OVERLAY_HEIGHT,
    MAX_OVERLAY_HEIGHT,
  );
  if (!monitor) {
    return {
      width: legacyWidth,
      height: legacyHeight,
      x: prefs.overlayX,
      y: prefs.overlayY,
      monitor: null,
    };
  }

  const scale = finitePositive(monitor.scaleFactor, 1);
  const monitorWidth = Math.max(1, monitor.size.width);
  const monitorHeight = Math.max(1, monitor.size.height);
  const origin = monitorLogicalOrigin(monitor);
  const minPhysicalWidth = Math.min(monitorWidth, MIN_OVERLAY_WIDTH * scale);
  const minPhysicalHeight = Math.min(monitorHeight, MIN_OVERLAY_HEIGHT * scale);
  const maxPhysicalWidth = Math.min(monitorWidth, MAX_OVERLAY_WIDTH * scale);
  const maxPhysicalHeight = Math.min(monitorHeight, MAX_OVERLAY_HEIGHT * scale);

  let physicalWidth = legacyWidth * scale;
  let physicalHeight = legacyHeight * scale;
  let physicalX: number | null = null;
  let physicalY: number | null = null;
  const placement = prefs.overlayPlacement;
  if (placement?.version === 2 && placement.rect) {
    physicalWidth = clamp(placement.rect.w * monitorWidth, minPhysicalWidth, maxPhysicalWidth);
    physicalHeight = clamp(placement.rect.h * monitorHeight, minPhysicalHeight, maxPhysicalHeight);
    const xRatio = clamp(placement.rect.x, 0, 1 - physicalWidth / monitorWidth);
    const yRatio = clamp(placement.rect.y, 0, 1 - physicalHeight / monitorHeight);
    physicalX = monitor.position.x + xRatio * monitorWidth;
    physicalY = monitor.position.y + yRatio * monitorHeight;
  } else if (prefs.overlayX != null && prefs.overlayY != null) {
    physicalX = monitor.position.x + (prefs.overlayX - origin.x) * scale;
    physicalY = monitor.position.y + (prefs.overlayY - origin.y) * scale;
  } else {
    // New installations open near the bottom-right of the usable work area,
    // keeping the result away from the taskbar and the screen edges.
    physicalX = monitor.workArea.position.x
      + Math.max(0, monitor.workArea.size.width - physicalWidth - DEFAULT_OVERLAY_MARGIN_X * scale);
    physicalY = monitor.workArea.position.y
      + Math.max(0, monitor.workArea.size.height - physicalHeight - DEFAULT_OVERLAY_MARGIN_Y * scale);
  }

  physicalWidth = clamp(physicalWidth, minPhysicalWidth, maxPhysicalWidth);
  physicalHeight = clamp(physicalHeight, minPhysicalHeight, maxPhysicalHeight);

  // Explicit placement is calibrated against a full-screen screenshot, while
  // automatic/legacy placement should avoid the taskbar work area.
  const boundsPosition = placement?.version === 2
    ? monitor.position
    : monitor.workArea.position;
  const boundsSize = placement?.version === 2
    ? monitor.size
    : monitor.workArea.size;
  const physicalWorkLeft = boundsPosition.x;
  const physicalWorkTop = boundsPosition.y;
  const physicalWorkRight = physicalWorkLeft + boundsSize.width;
  const physicalWorkBottom = physicalWorkTop + boundsSize.height;
  const minX = Math.min(physicalWorkLeft, physicalWorkRight - physicalWidth);
  const maxX = Math.max(physicalWorkLeft, physicalWorkRight - physicalWidth);
  const minY = Math.min(physicalWorkTop, physicalWorkBottom - physicalHeight);
  const maxY = Math.max(physicalWorkTop, physicalWorkBottom - physicalHeight);
  physicalX = clamp(physicalX, minX, maxX);
  physicalY = clamp(physicalY, minY, maxY);

  return {
    width: Math.round(physicalWidth),
    height: Math.round(physicalHeight),
    x: Math.round(physicalX),
    y: Math.round(physicalY),
    monitor,
  };
}

async function applyOverlayEffects(win: OverlayGeomWin) {
  const prefs = loadAlterQPrefs();
  const alpha = Math.round(
    Math.min(1, Math.max(0.15, prefs.overlayOpacity ?? 0.42)) * 255,
  );
  try {
    await win.setEffects({
      effects: [Effect.Acrylic, Effect.Mica, Effect.Blur],
      color: [32, 32, 36, alpha],
    });
  } catch {
    /* 旧系统或不支持特效时忽略 */
  }
}

export async function applyAlterQOverlayGeometry(win?: OverlayGeomWin | null) {
  const prefs = loadAlterQPrefs();
  const target = win ?? (await WebviewWindow.getByLabel(OVERLAY_LABEL));
  if (!target) return;
  try {
    const geo = await overlayGeometryFromPrefs(prefs, target);
    // A target monitor may use a different DPI from the window's current
    // monitor. PhysicalPosition avoids scaling these virtual-desktop pixels
    // through the wrong monitor before the move completes.
    if (geo.x != null && geo.y != null) {
      const position = geo.monitor
        ? new PhysicalPosition(geo.x, geo.y)
        : new LogicalPosition(geo.x, geo.y);
      await target.setPosition(position);
    }
    const size = geo.monitor
      ? new PhysicalSize(geo.width, geo.height)
      : new LogicalSize(geo.width, geo.height);
    await target.setSize(size);
    await target.setSizeConstraints({
      minWidth: MIN_OVERLAY_WIDTH,
      minHeight: MIN_OVERLAY_HEIGHT,
      maxWidth: MAX_OVERLAY_WIDTH,
      maxHeight: MAX_OVERLAY_HEIGHT,
    });
  } catch (e) {
    console.warn('alter-q apply overlay geometry failed', e);
  }
}

/** 刷新已打开小窗的 Acrylic/几何（透明度等偏好变更后） */
export async function refreshAlterQOverlayAppearance() {
  const win = await WebviewWindow.getByLabel(OVERLAY_LABEL);
  if (!win) return;
  await applyAlterQOverlayGeometry(win);
  await applyOverlayEffects(win);
  try {
    await emit('alter-q-overlay-prefs-changed', {
      opacity: loadAlterQPrefs().overlayOpacity,
    });
  } catch {
    /* noop */
  }
}

/** Toggle the native overlay between passive display and direct adjustment. */
export async function setAlterQOverlayInteractionMode(mode: AlterQOverlayInteractionMode): Promise<boolean> {
  const prefs = loadAlterQPrefs();
  prefs.overlayLocked = mode === 'display';
  try {
    saveAlterQPrefs(prefs);
  } catch {
    /* Keep the live window mode usable when preference storage is unavailable. */
  }
  try {
    localStorage.setItem(ALTER_Q_OVERLAY_INTERACTION_STORAGE_KEY, mode);
  } catch {
    /* Live delivery still keeps an already-open overlay in sync. */
  }
  try {
    await emit(ALTER_Q_OVERLAY_INTERACTION_EVENT, {mode});
  } catch {
    /* The overlay may be closed or the event bridge may be unavailable. */
  }
  const win = await WebviewWindow.getByLabel(OVERLAY_LABEL);
  if (!win) return false;
  await Promise.allSettled([
    win.setFocusable(mode === 'adjusting'),
    win.setIgnoreCursorEvents(mode === 'display'),
  ]);
  if (mode === 'adjusting') {
    try {
      await win.show();
      await win.unminimize();
      await win.setFocus();
    } catch {
      /* Keep the preference change even when the auxiliary window is closing. */
    }
  }
  return true;
}

/** 将当前小窗位置/大小写回偏好（逻辑像素） */
export async function persistAlterQOverlayGeometry(win: OverlayGeomWin) {
  const sequence = ++overlayGeometryPersistSequence;
  const sampledAt = Date.now();
  try {
    const scale = finitePositive(await win.scaleFactor(), 1);
    const rawPos = await win.outerPosition();
    const rawSize = await win.innerSize();
    if (
      ![rawPos.x, rawPos.y, rawSize.width, rawSize.height].every(Number.isFinite)
      || rawSize.width <= 0
      || rawSize.height <= 0
    ) {
      return;
    }
    const physicalX = rawPos.x;
    const physicalY = rawPos.y;
    const physicalW = rawSize.width;
    const physicalH = rawSize.height;
    let overlayX = Math.round(physicalX / scale);
    let overlayY = Math.round(physicalY / scale);
    let overlayW = Math.min(MAX_OVERLAY_WIDTH, Math.max(MIN_OVERLAY_WIDTH, Math.round(physicalW / scale)));
    let overlayH = Math.min(MAX_OVERLAY_HEIGHT, Math.max(MIN_OVERLAY_HEIGHT, Math.round(physicalH / scale)));
    let overlayPlacement: AlterQPrefs['overlayPlacement'] = null;

    let monitor: Monitor | null = null;
    const centerX = physicalX + physicalW / 2;
    const centerY = physicalY + physicalH / 2;
    try {
      const monitors = await availableMonitors();
      monitor = monitors.find((candidate) =>
        monitorContainsPhysicalPoint(candidate, centerX, centerY),
      ) ?? null;
    } catch {
      /* Fall back to monitorFromPoint below. */
    }
    if (!monitor) {
      try {
        monitor = await monitorFromPoint(centerX, centerY);
      } catch {
        monitor = null;
      }
    }
    if (
      monitor
      && Number.isFinite(monitor.size.width)
      && Number.isFinite(monitor.size.height)
      && monitor.size.width > 0
      && monitor.size.height > 0
    ) {
      const monitorScale = finitePositive(monitor.scaleFactor, scale);
      const monitorWidth = monitor.size.width;
      const monitorHeight = monitor.size.height;
      const monitorPhysicalW = Math.min(monitorWidth, Math.max(1, physicalW));
      const monitorPhysicalH = Math.min(monitorHeight, Math.max(1, physicalH));
      const rectW = monitorPhysicalW / monitorWidth;
      const rectH = monitorPhysicalH / monitorHeight;
      const rectX = clamp((physicalX - monitor.position.x) / monitorWidth, 0, 1 - rectW);
      const rectY = clamp((physicalY - monitor.position.y) / monitorHeight, 0, 1 - rectH);
      overlayPlacement = {
        version: 2,
        monitorName: monitor.name ?? null,
        monitorWidth,
        monitorHeight,
        rect: {
          x: rectX,
          y: rectY,
          w: rectW,
          h: rectH,
        },
      };
      // Keep the legacy logical values coherent for older app versions and
      // for recovery if a monitor is disconnected later.
      const origin = monitor.position.toLogical(monitorScale);
      overlayX = Math.round(origin.x + (physicalX - monitor.position.x) / monitorScale);
      overlayY = Math.round(origin.y + (physicalY - monitor.position.y) / monitorScale);
      overlayW = Math.min(MAX_OVERLAY_WIDTH, Math.max(MIN_OVERLAY_WIDTH, Math.round(monitorPhysicalW / monitorScale)));
      overlayH = Math.min(MAX_OVERLAY_HEIGHT, Math.max(MIN_OVERLAY_HEIGHT, Math.round(monitorPhysicalH / monitorScale)));
    }
    if (sequence !== overlayGeometryPersistSequence) return;
    try {
      const latestSample = Number(localStorage.getItem(OVERLAY_GEOMETRY_SAMPLE_STORAGE_KEY));
      if (
        Number.isFinite(latestSample)
        && latestSample > sampledAt
        && latestSample <= Date.now() + OVERLAY_GEOMETRY_CLOCK_SKEW_MS
      ) {
        return;
      }
    } catch {
      /* Cross-WebView ordering is best effort when storage is unavailable. */
    }

    // Reload after the native calls so geometry persistence never overwrites
    // a shortcut, opacity, or lock-mode change made by another WebView.
    const latestPrefs = loadAlterQPrefs();
    latestPrefs.overlayX = overlayX;
    latestPrefs.overlayY = overlayY;
    latestPrefs.overlayW = overlayW;
    latestPrefs.overlayH = overlayH;
    // A valid native sample without a resolvable monitor must invalidate v2;
    // otherwise the stale relative placement wins over the new legacy values.
    latestPrefs.overlayPlacement = overlayPlacement;
    saveAlterQPrefs(latestPrefs);
    try {
      localStorage.setItem(OVERLAY_GEOMETRY_SAMPLE_STORAGE_KEY, String(sampledAt));
    } catch {
      /* Geometry is already persisted in the preferences object. */
    }
    await broadcastOverlayGeometry(latestPrefs);
  } catch (e) {
    console.warn('alter-q persist overlay geometry failed', e);
  }
}

export async function resetAndApplyAlterQOverlayGeometry() {
  const prefs = loadAlterQPrefs();
  prefs.overlayX = null;
  prefs.overlayY = null;
  prefs.overlayW = DEFAULT_OVERLAY_WIDTH;
  prefs.overlayH = DEFAULT_OVERLAY_HEIGHT;
  prefs.overlayPlacement = null;
  saveAlterQPrefs(prefs);
  await broadcastOverlayGeometry(prefs);
  const win = await WebviewWindow.getByLabel(OVERLAY_LABEL);
  if (!win) return;
  try {
    await applyAlterQOverlayGeometry(win);
    await persistAlterQOverlayGeometry(win);
  } catch (e) {
    console.warn('alter-q reset overlay geometry failed', e);
  }
}

async function ensureOverlayWindowRev() {
  if (overlayRevisionEnsured) return;
  if (overlayRevisionPromise) return overlayRevisionPromise;
  const revisionCheck = (async () => {
    let storedRevision: string | null = null;
    try {
      storedRevision = localStorage.getItem(ALTER_Q_OVERLAY_WINDOW_REV_KEY);
    } catch {
      /* Storage may be unavailable in a browser preview. */
    }
    if (storedRevision !== ALTER_Q_OVERLAY_WINDOW_REV) {
      let revisionApplied = true;
      const existing = await WebviewWindow.getByLabel(OVERLAY_LABEL);
      if (existing) {
        try {
          await existing.destroy();
        } catch (e) {
          console.warn('destroy alter-q overlay failed', e);
          revisionApplied = false;
        }
      }
      if (revisionApplied) {
        try {
          localStorage.setItem(ALTER_Q_OVERLAY_WINDOW_REV_KEY, ALTER_Q_OVERLAY_WINDOW_REV);
        } catch {
          /* The revision check is an optimization; the window can still be used. */
        }
      }
      overlayRevisionEnsured = revisionApplied;
      return;
    }
    overlayRevisionEnsured = true;
  })();
  overlayRevisionPromise = revisionCheck;
  try {
    await revisionCheck;
  } finally {
    if (overlayRevisionPromise === revisionCheck) overlayRevisionPromise = null;
  }
}

async function createAlterQOverlayWindow(
  payload: AlterQOverlayPayload,
  prefs: AlterQPrefs,
): Promise<WebviewWindow> {
  const createOpts = {
    url: '#/alter-q-overlay',
    title: '\u7409\u96c0 Q',
    width: clamp(
      finitePositive(prefs.overlayW, DEFAULT_OVERLAY_WIDTH),
      MIN_OVERLAY_WIDTH,
      MAX_OVERLAY_WIDTH,
    ),
    height: clamp(
      finitePositive(prefs.overlayH, DEFAULT_OVERLAY_HEIGHT),
      MIN_OVERLAY_HEIGHT,
      MAX_OVERLAY_HEIGHT,
    ),
    decorations: false,
    transparent: true,
    shadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    focusable: false,
    visible: false,
    focus: false,
  };
  let markOverlayReady: (() => void) | null = null;
  const overlayReady = new Promise<void>((resolve) => {
    markOverlayReady = resolve;
  });
  let readyUnlisten: UnlistenFn | null = null;
  try {
    readyUnlisten = await listen<{label?: unknown}>(ALTER_Q_OVERLAY_READY_EVENT, (event) => {
      if (event.payload?.label === OVERLAY_LABEL) markOverlayReady?.();
    });
  } catch {
    // Storage remains the fallback if the global event bridge is unavailable.
  }

  const win = new WebviewWindow(OVERLAY_LABEL, createOpts);
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (reason: unknown) => {
        if (settled) return;
        settled = true;
        reject(reason instanceof Error ? reason : new Error(String(reason)));
      };
      const onCreated = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const onError = (event: {payload?: unknown}) => {
        fail(event.payload ?? 'ALTER_Q_OVERLAY_CREATE_FAILED');
      };
      void win.once('tauri://created', onCreated).catch(fail);
      void win.once('tauri://error', onError).catch(fail);
    });
    await applyAlterQOverlayGeometry(win);
    await applyOverlayEffects(win);
    if (readyUnlisten) {
      let timeout: ReturnType<typeof setTimeout> | null = null;
      try {
        await Promise.race([
          overlayReady,
          new Promise<void>((resolve) => {
            timeout = setTimeout(resolve, OVERLAY_READY_TIMEOUT_MS);
          }),
        ]);
      } finally {
        if (timeout != null) clearTimeout(timeout);
      }
    }
    await emit('alter-q-overlay-result', payload);
    await win.show();
    return win;
  } finally {
    readyUnlisten?.();
  }
}

async function presentAlterQResultOverlay(payload: AlterQOverlayPayload) {
  const prefs = loadAlterQPrefs();
  const {theta, r: overlayR, alpha: overlayAlpha} = payload;
  const fingerprint = overlayFingerprint(theta, overlayR, overlayAlpha);
  const captureClaim = claimCaptureOverlay(fingerprint);
  if (captureClaim === 'duplicate') return;
  const now = Date.now();
  if (
    captureClaim === 'none'
    && fingerprint === lastOverlayFingerprint
    && now - lastOverlayShownAt < OVERLAY_DEDUPE_MS
  ) {
    return;
  }
  lastOverlayFingerprint = fingerprint;
  lastOverlayShownAt = now;
  persistOverlayPayload(payload);
  await ensureOverlayWindowRev();

  let win = await WebviewWindow.getByLabel(OVERLAY_LABEL);
  if (!win && overlayCreationPromise) {
    try {
      await overlayCreationPromise;
    } catch (e) {
      console.warn('alter-q overlay creation failed', e);
    }
    win = await WebviewWindow.getByLabel(OVERLAY_LABEL);
  }
  if (win) {
    // Do not snap an actively adjusted window back to the last debounced
    // sample when a capture finishes mid-drag.
    if (prefs.overlayLocked !== false) await applyAlterQOverlayGeometry(win);
    await applyOverlayEffects(win);
    await emit('alter-q-overlay-result', payload);
    await win.show();
    try {
      await win.unminimize();
    } catch {
      /* A hidden overlay may not have a minimized state on older runtimes. */
    }
    return;
  }

  const creation = createAlterQOverlayWindow(payload, prefs);
  overlayCreationPromise = creation;
  try {
    await creation;
  } catch (e) {
    console.warn('alter-q overlay creation failed', e);
  } finally {
    if (overlayCreationPromise === creation) overlayCreationPromise = null;
  }
}

function scheduleOverlayPresentation(request: OverlayShowRequest): Promise<void> {
  if (!ownsAlterQHotkey()) return Promise.resolve();
  // Arrival order is the only reliable total order across WebViews. Wall
  // clocks can move backwards and string ids do not sort numeric sequences.
  const presentationSequence = ++overlayPresentationSequence;
  const task = overlayPresentationQueue.then(async () => {
    if (presentationSequence !== overlayPresentationSequence) return;
    await presentAlterQResultOverlay(request.payload);
  });
  overlayPresentationQueue = task.catch(() => undefined);
  return task;
}

async function ensureOverlayShowRequestListener() {
  if (!ownsAlterQHotkey() || overlayShowRequestUnlisten) return;
  if (!overlayShowRequestListenerStarting) {
    let disposed = false;
    registerHmrCleanup(() => {
      disposed = true;
      overlayShowRequestUnlisten?.();
      overlayShowRequestUnlisten = null;
      overlayShowRequestListenerStarting = null;
    });
    overlayShowRequestListenerStarting = listen<OverlayShowRequest>(
      OVERLAY_SHOW_REQUEST_EVENT,
      (event) => {
        const request = parseOverlayShowRequest(event.payload);
        if (!request) return;
        void scheduleOverlayPresentation(request).catch((e) => {
          console.warn('alter-q overlay show request failed', e);
        });
      },
    ).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      overlayShowRequestUnlisten = unlisten;
    }).finally(() => {
      if (!overlayShowRequestUnlisten) overlayShowRequestListenerStarting = null;
    });
  }
  await overlayShowRequestListenerStarting;
}

export async function showAlterQResultOverlay(
  theta: AlterQThetaResult,
  opts?: {r?: number; alpha?: number; hideSec?: number},
) {
  const prefs = loadAlterQPrefs();
  const request = nextOverlayShowRequest({
    theta,
    r: opts?.r ?? theta.r,
    alpha: opts?.alpha ?? theta.alpha,
    hideSec: opts?.hideSec ?? prefs.overlayHideSec ?? 0,
  });
  try {
    if (ownsAlterQHotkey()) {
      await scheduleOverlayPresentation(request);
    } else {
      await emit(OVERLAY_SHOW_REQUEST_EVENT, request);
    }
  } catch (e) {
    console.warn('alter-q show overlay failed', e);
  }
}

async function unregisterCurrent(): Promise<boolean> {
  registeredHotkey = hotkeyRuntime.registeredHotkey;
  if (!registeredHotkey) return true;
  const current = registeredHotkey;
  try {
    if (await isRegistered(current)) {
      await unregister(current);
    }
  } catch (e) {
    console.warn('alter-q unregister hotkey failed', current, e);
    return false;
  }
  setRegisteredHotkey(null);
  return true;
}

export async function runAlterQCapture(
  prefs?: AlterQPrefs,
  opts?: {requireFresh?: boolean},
): Promise<AlterQCaptureResult> {
  const p = prefs ?? loadAlterQPrefs();
  if (!p.screenshotFolder) {
    return {
      screenshotPath: '',
      alpha: null,
      angYaw: null,
      angRoll: null,
      distanceM: null,
      showposText: '',
      pingText: '',
      showposPreview: '',
      pingPreview: '',
      showposEngine: '',
      pingEngine: '',
      showposConfidence: null,
      pingConfidence: null,
      theta: null,
      error: 'NO_FOLDER',
    };
  }
  const folder = await normalizeAlterQFolder(p.screenshotFolder);
  // Keep the freshness boundary next to the native capture request. Path
  // normalization can cross IPC and must not widen the accepted age window.
  const captureStartedAtMs = Date.now();
  return alterQFromLatestScreenshot({
    folder,
    delayMs: p.delayMs,
    showposRoi: p.showposRoi,
    pingRoi: p.pingRoi,
    engine: p.ocrEngine ?? 'auto',
    captureStartedAtMs,
    requireFresh: opts?.requireFresh ?? false,
  });
}

async function publishAlterQCaptureResult(result: AlterQCaptureResult) {
  const envelope: CaptureResultEnvelope = {
    id: nextCaptureResultId(),
    emittedAt: Date.now(),
    result,
  };
  rememberCaptureEnvelope(envelope);
  persistCaptureResult(envelope);
  try {
    await emit(CAPTURE_RESULT_EVENT, envelope);
  } catch (e) {
    // The persisted envelope is a fallback for a window that starts after
    // the capture; keep hotkey capture successful if event delivery is down.
    console.warn('alter-q publish capture result failed', e);
  }
}

async function onHotkey(event?: ShortcutEvent) {
  // The plugin emits both Pressed and Released. Only Pressed should trigger a
  // capture; a short guard also absorbs duplicate Pressed notifications from
  // keyboard repeat/driver quirks.
  if (event && event.state !== 'Pressed') return;
  const shortcut = event?.shortcut ?? registeredHotkey;
  const now = Date.now();
  if (
    shortcut
    && shortcut === lastHotkeyPressedShortcut
    && now - lastHotkeyPressedAt < HOTKEY_DEBOUNCE_MS
  ) {
    return;
  }
  lastHotkeyPressedShortcut = shortcut ?? null;
  lastHotkeyPressedAt = now;
  if (hotkeyRuntime.captureInFlight) return;
  hotkeyRuntime.captureInFlight = true;
  try {
    const result = await runAlterQCapture(undefined, {requireFresh: true});
    await publishAlterQCaptureResult(result);
    if (result.theta) {
      void showAlterQResultOverlay(result.theta, {
        r: result.distanceM ?? result.theta.r,
        alpha: result.alpha ?? result.theta.alpha,
      });
    }
    try {
      onResult?.(result);
    } catch (e) {
      console.warn('alter-q hotkey result handler failed', e);
    }
  } catch (e) {
    const errorResult: AlterQCaptureResult = {
      screenshotPath: '',
      alpha: null,
      angYaw: null,
      angRoll: null,
      distanceM: null,
      showposText: '',
      pingText: '',
      showposPreview: '',
      pingPreview: '',
      showposEngine: '',
      pingEngine: '',
      showposConfidence: null,
      pingConfidence: null,
      theta: null,
      error: String(e),
    };
    await publishAlterQCaptureResult(errorResult);
    try {
      onResult?.(errorResult);
    } catch (handlerError) {
      console.warn('alter-q hotkey error handler failed', handlerError);
    }
  } finally {
    hotkeyRuntime.captureInFlight = false;
  }
}

// A native global-shortcut registration can outlive a Vite module instance.
// Its callback therefore routes through this stable object and always reaches
// the latest module's handler after HMR.
hotkeyRuntime.dispatch = onHotkey;

function dispatchAlterQHotkey(event?: ShortcutEvent) {
  hotkeyRuntime.dispatch?.(event);
}

/** 按偏好注册/注销全局热键。 */
async function syncAlterQHotkeyNow(prefs?: AlterQPrefs) {
  const p = prefs ?? loadAlterQPrefs();
  const desiredHotkey = p.enabled && p.setupDone && p.hotkey ? p.hotkey : null;
  registeredHotkey = hotkeyRuntime.registeredHotkey;
  if (!hotkeyRuntime.known) {
    try {
      // An untracked registration can only be a legacy callback from this app
      // (notably the old locale shortcut). Clear the persisted candidate even
      // when Alter-Q is disabled so a reload cannot leave a stale registration.
      const candidate = p.hotkey?.trim();
      if (candidate && await isRegistered(candidate)) await unregister(candidate);
    } catch (e) {
      console.warn('alter-q clear untracked hotkey failed', p.hotkey, e);
      throw e;
    }
    setRegisteredHotkey(null);
  }
  if (registeredHotkey === desiredHotkey) {
    hotkeyRuntime.known = true;
    lastSyncedPrefs = {...p};
    return;
  }
  const previousHotkey = registeredHotkey;
  if (!(await unregisterCurrent())) {
    throw new Error('ALTER_Q_HOTKEY_UNREGISTER_FAILED');
  }
  if (!desiredHotkey) {
    setRegisteredHotkey(null);
    lastSyncedPrefs = {...p};
    return;
  }
  try {
    await register(desiredHotkey, dispatchAlterQHotkey);
    setRegisteredHotkey(desiredHotkey);
    lastSyncedPrefs = {...p};
  } catch (e) {
    console.warn('alter-q register hotkey failed', desiredHotkey, e);
    // Do not leave the application silently without a working shortcut when
    // a replacement is rejected (for example because another app owns it).
    if (previousHotkey) {
      try {
        await register(previousHotkey, dispatchAlterQHotkey);
        setRegisteredHotkey(previousHotkey);
      } catch (rollbackError) {
        console.warn('alter-q rollback hotkey registration failed', previousHotkey, rollbackError);
      }
    }
    throw e;
  }
}

/** 全局热键只能由主窗口持有，避免多个 WebView 重复注册同一快捷键。 */
export async function syncAlterQHotkey(prefs?: AlterQPrefs) {
  if (!ownsAlterQHotkey()) return;
  const task = hotkeyRuntime.hotkeySyncQueue.then(() => syncAlterQHotkeyNow(prefs));
  hotkeyRuntime.hotkeySyncQueue = task.catch(() => undefined);
  await task;
}

async function ensureAlterQPrefsSyncListener() {
  if (!ownsAlterQHotkey() || prefsSyncUnlisten) return;
  if (!prefsSyncListenerStarting) {
    let disposed = false;
    registerHmrCleanup(() => {
      disposed = true;
      prefsSyncUnlisten?.();
      prefsSyncUnlisten = null;
      prefsSyncListenerStarting = null;
    });
    prefsSyncListenerStarting = listen(PREFS_SYNC_EVENT, (event) => {
      const request = parsePrefsSyncRequest(event.payload);
      const desiredPrefs = loadAlterQPrefs();
      if (request) {
        // A request can arrive after another window has already saved a newer
        // hotkey choice. Do not temporarily re-register that stale value.
        if (!sameHotkeyPrefs(desiredPrefs, request.desired)) {
          void emit(PREFS_SYNC_RESULT_EVENT, {id: request.id, ok: true}).catch(() => undefined);
          return;
        }
        Object.assign(desiredPrefs, request.desired);
      }
      void (async () => {
        try {
          await syncAlterQHotkey(desiredPrefs);
          const latest = loadAlterQPrefs();
          if (request && !sameHotkeyPrefs(latest, request.desired)) {
            try {
              await syncAlterQHotkey(latest);
            } catch (e) {
              // The newer request has its own acknowledgement and rollback;
              // this older request must not claim or undo it.
              console.warn('alter-q reconcile newer hotkey prefs failed', e);
            }
          }
          if (request) {
            try {
              await emit(PREFS_SYNC_RESULT_EVENT, {id: request.id, ok: true});
            } catch {
              /* The requester will time out and reload persisted preferences. */
            }
          }
        } catch (e) {
          console.warn('alter-q sync hotkey from prefs event failed', e);
          const current = loadAlterQPrefs();
          // Only roll back the request that still owns the persisted hotkey.
          // A newer request may already be queued behind this failed one.
          if (!request || sameHotkeyPrefs(current, request.desired)) {
            const fallback = lastSyncedPrefs
              ? {
                  ...current,
                  enabled: lastSyncedPrefs.enabled,
                  setupDone: lastSyncedPrefs.setupDone,
                  hotkey: lastSyncedPrefs.hotkey,
                }
              : {...current, enabled: false};
            if (!registeredHotkey && fallback.enabled) fallback.enabled = false;
            saveAlterQPrefs(fallback);
            await broadcastAlterQPrefs(fallback);
          }
          if (request) {
            try {
              await emit(PREFS_SYNC_RESULT_EVENT, {
                id: request.id,
                ok: false,
                error: String(e),
              });
            } catch {
              /* The requester will time out and reload persisted preferences. */
            }
          }
        }
      })();
    }).then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      prefsSyncUnlisten = unlisten;
    }).finally(() => {
      if (!prefsSyncUnlisten) prefsSyncListenerStarting = null;
    });
  }
  await prefsSyncListenerStarting;
}

export type ApplyAlterQPrefsOptions = {
  /** Use only when the caller intentionally edited the placement controls. */
  replaceOverlayGeometry?: boolean;
  /** Persist only fields edited by this caller, merging them onto fresh storage. */
  changedKeys?: readonly (keyof AlterQPrefs)[];
};

const OVERLAY_GEOMETRY_PREF_KEYS: ReadonlySet<keyof AlterQPrefs> = new Set([
  'overlayX',
  'overlayY',
  'overlayW',
  'overlayH',
  'overlayPlacement',
]);

export async function applyAlterQPrefs(
  prefs: AlterQPrefs,
  options: ApplyAlterQPrefsOptions = {},
) {
  const changedKeys = new Set<keyof AlterQPrefs>(
    options.changedKeys ?? Object.keys(prefs) as Array<keyof AlterQPrefs>,
  );
  if (!options.replaceOverlayGeometry) {
    for (const key of OVERLAY_GEOMETRY_PREF_KEYS) changedKeys.delete(key);
  }
  const requested = {...prefs};
  if (changedKeys.has('screenshotFolder')) {
    requested.screenshotFolder = requested.screenshotFolder
      ? await normalizeAlterQFolder(requested.screenshotFolder)
      : '';
  }
  // Read immediately before saving: path normalization crosses IPC, so
  // another WebView may have saved newer fields while it awaited.
  const previous = loadAlterQPrefs();
  const normalized = {...previous};
  for (const key of changedKeys) {
    Object.assign(normalized, {[key]: requested[key]});
  }
  const geometryChanged = !sameOverlayGeometry(previous, normalized);
  const hotkeyChanged = !sameHotkeyPrefs(previous, normalized);
  saveAlterQPrefs(normalized);
  Object.assign(prefs, normalized);
  if (ownsAlterQHotkey()) {
    try {
      await syncAlterQHotkey(normalized);
    } catch (e) {
      // Keep persisted preferences consistent with the shortcut that is
      // actually registered. The caller can surface the registration error
      // without leaving an apparently-enabled but unusable hotkey behind.
      const latest = loadAlterQPrefs();
      const ownsPersistedHotkey = sameHotkeyPrefs(latest, normalized);
      const rollback = ownsPersistedHotkey
        ? {
            ...latest,
            enabled: previous.enabled,
            setupDone: previous.setupDone,
            hotkey: previous.hotkey,
          }
        : latest;
      if (ownsPersistedHotkey) {
        if (!registeredHotkey && rollback.enabled) rollback.enabled = false;
        saveAlterQPrefs(rollback);
      }
      Object.assign(prefs, rollback);
      await broadcastAlterQPrefs(rollback);
      if (geometryChanged) await broadcastOverlayGeometry(rollback);
      throw e;
    }
  } else {
    const wantsActiveHotkey = normalized.enabled
      && normalized.setupDone
      && normalized.hotkey.length > 0;
    const needsHotkeySync = hotkeyChanged || (wantsActiveHotkey && !childHotkeySyncHealthy);
    if (needsHotkeySync) {
      try {
        await requestAlterQPrefsSync(hotkeyPrefsSnapshot(normalized));
        childHotkeySyncHealthy = true;
      } catch (e) {
        childHotkeySyncHealthy = false;
        const latest = loadAlterQPrefs();
        const ownsPersistedHotkey = sameHotkeyPrefs(latest, normalized);
        const rollback = ownsPersistedHotkey
          ? {
              ...latest,
              enabled: previous.enabled,
              setupDone: previous.setupDone,
              hotkey: previous.hotkey,
            }
          : latest;
        if (ownsPersistedHotkey) saveAlterQPrefs(rollback);
        Object.assign(prefs, rollback);
        await broadcastAlterQPrefs(rollback);
        if (geometryChanged) await broadcastOverlayGeometry(rollback);
        throw e;
      }
    } else if (!wantsActiveHotkey) {
      childHotkeySyncHealthy = true;
    }
  }
  const committed = loadAlterQPrefs();
  Object.assign(prefs, committed);
  await broadcastAlterQPrefs(committed);
  if (geometryChanged) await broadcastOverlayGeometry(committed);
}

export async function bootstrapAlterQEventListeners() {
  if (!ownsAlterQHotkey()) return;
  await Promise.all([
    ensureAlterQPrefsSyncListener(),
    ensureOverlayShowRequestListener(),
  ]);
}

export async function bootstrapAlterQFromStorage() {
  if (!ownsAlterQHotkey()) return;
  await bootstrapAlterQEventListeners();
  let prefs = loadAlterQPrefs();
  if (prefs.screenshotFolder) {
    const sourceFolder = prefs.screenshotFolder;
    const normalizedFolder = await normalizeAlterQFolder(sourceFolder);
    const latestPrefs = loadAlterQPrefs();
    if (latestPrefs.screenshotFolder === sourceFolder) {
      latestPrefs.screenshotFolder = normalizedFolder;
      saveAlterQPrefs(latestPrefs);
    }
    prefs = loadAlterQPrefs();
  }
  // Re-read immediately before queueing so an early child-window edit wins.
  prefs = loadAlterQPrefs();
  try {
    await syncAlterQHotkey(prefs);
  } catch {
    const failed = loadAlterQPrefs();
    // Do not let a stale startup attempt disable a newer queued request.
    if (sameHotkeyPrefs(failed, prefs)) {
      failed.enabled = false;
      saveAlterQPrefs(failed);
      lastSyncedPrefs = {...failed};
    }
  }
}
