<script setup lang="ts">
import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {LogicalSize, PhysicalPosition, PhysicalSize} from '@tauri-apps/api/dpi';
import {emit as emitEvent, listen} from '@tauri-apps/api/event';
import {apexQComputeTheta} from '@/ipc/commands.ts';
import type {
  ApexQOverlayInteractionMode,
  ApexQOverlayPayload,
  ApexQPrefs,
  ApexQThetaResult,
} from '@/types/apex_q.ts';
import {
  APEX_Q_OVERLAY_INTERACTION_EVENT,
  APEX_Q_OVERLAY_READY_EVENT,
  APEX_Q_PREFS_CHANGED_EVENT,
  MIN_OVERLAY_HEIGHT,
  MIN_OVERLAY_WIDTH,
} from '@/types/apex_q.ts';
import {loadApexQPrefs, patchApexQPrefs, saveApexQPrefs} from '@/stores/apex_q_preferences.ts';
import {persistApexQOverlayGeometry} from '@/utils/apex_q.ts';

type ResizeDirection =
  | 'East'
  | 'North'
  | 'NorthEast'
  | 'NorthWest'
  | 'South'
  | 'SouthEast'
  | 'SouthWest'
  | 'West';

const {t} = useI18n();
const payload = ref<ApexQOverlayPayload | null>(null);
const ready = ref(false);
const mode = ref<ApexQOverlayInteractionMode>(loadApexQPrefs().overlayLocked ? 'display' : 'adjusting');
const editing = ref(false);
const editR = ref<number | null>(null);
const editAlpha = ref<number | null>(null);
const busy = ref(false);
const err = ref('');
const overlayOpacity = ref(loadApexQPrefs().overlayOpacity ?? 0.42);
const EDIT_MIN_WIDTH = 240;
const EDIT_MIN_HEIGHT = 180;
const MAX_OVERLAY_WIDTH = 640;
const MAX_OVERLAY_HEIGHT = 480;

type EditGeometrySnapshot = {
  position: {x: number; y: number};
  size: {width: number; height: number};
};
const editGeometrySnapshot = ref<EditGeometrySnapshot | null>(null);

function refreshOpacityFromPrefs() {
  overlayOpacity.value = loadApexQPrefs().overlayOpacity ?? 0.42;
}

const panelStyle = computed(() => ({
  background: `rgba(28, 28, 32, ${overlayOpacity.value})`,
}));

const isAdjusting = computed(() => mode.value === 'adjusting');

function parseInteractionMode(value: unknown): ApexQOverlayInteractionMode | null {
  if (value === 'display' || value === 'adjusting') return value;
  if (value && typeof value === 'object' && 'mode' in value) {
    const modeValue = (value as {mode?: unknown}).mode;
    if (modeValue === 'display' || modeValue === 'adjusting') return modeValue;
  }
  return null;
}

function isOverlayPayload(value: unknown): value is ApexQOverlayPayload {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<ApexQOverlayPayload>;
  if (!p.theta || typeof p.theta !== 'object') return false;
  const theta = p.theta as Partial<ApexQThetaResult>;
  return [
    p.r,
    p.alpha,
    p.hideSec,
    theta.r,
    theta.alpha,
    theta.recommendedLow,
    theta.recommendedHigh,
  ].every((number) => Number.isFinite(number));
}

async function persistInteractionMode(next: ApexQOverlayInteractionMode) {
  const prefs = loadApexQPrefs();
  prefs.overlayLocked = next === 'display';
  saveApexQPrefs(prefs, ['overlayLocked']);
  try {
    await emitEvent(APEX_Q_PREFS_CHANGED_EVENT, {
      source: getCurrentWindow().label,
      prefs: {overlayLocked: prefs.overlayLocked},
      changedKeys: ['overlayLocked'],
    });
  } catch {
    /* The persisted store is still current in this WebView. */
  }
}

async function applyInteractionMode(
  next: ApexQOverlayInteractionMode,
  options: {broadcast?: boolean; persist?: boolean} = {},
) {
  mode.value = next;
  if (options.persist !== false) await persistInteractionMode(next);
  const win = getCurrentWindow();
  await Promise.allSettled([
    win.setFocusable(next === 'adjusting'),
    win.setIgnoreCursorEvents(next === 'display'),
  ]);
  if (options.broadcast !== false) {
    try {
      await emitEvent(APEX_Q_OVERLAY_INTERACTION_EVENT, {mode: next});
    } catch {
      /* the main window may not be listening yet */
    }
  }
  if (next === 'display' && payload.value && !editing.value) {
    scheduleHide(payload.value.hideSec);
  }
}

function loadInteractionMode() {
  mode.value = loadApexQPrefs().overlayLocked ? 'display' : 'adjusting';
}

let hideTimer: ReturnType<typeof setTimeout> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let unlisten: (() => void) | undefined;
const unlistenGeom: Array<() => void> = [];
let unlistenInteraction: (() => void) | undefined;
let unlistenPrefs: (() => void) | undefined;

function clearHideTimer() {
  if (hideTimer != null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function scheduleHide(hideSec: number) {
  clearHideTimer();
  if (hideSec <= 0 || editing.value || isAdjusting.value) return;
  hideTimer = setTimeout(() => {
    // Timed overlays release their WebView/WebView2 resources completely.
    // hideSec=0 intentionally keeps the existing never-hide behavior.
    void getCurrentWindow().destroy();
  }, hideSec * 1000);
}

function applyPayload(
  p: ApexQOverlayPayload,
  options: {leaveEditor?: boolean} = {},
) {
  if (!isOverlayPayload(p)) return;
  const wasEditing = editing.value;
  payload.value = p;
  editR.value = p.r;
  editAlpha.value = p.alpha;
  if (options.leaveEditor !== false) {
    editing.value = false;
    editGeometrySnapshot.value = null;
  }
  err.value = '';
  scheduleHide(p.hideSec);
  if (wasEditing && options.leaveEditor !== false) {
    void (async () => {
      await flushPersistGeometry();
      await setEditingConstraints(false);
      await applyInteractionMode('display');
    })();
  }
}

function makeShellTransparent() {
  document.getElementById('splash')?.remove();
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  document.body.style.overflow = 'hidden';
  const app = document.getElementById('app');
  if (app) app.style.background = 'transparent';
}

async function closeOverlay() {
  clearHideTimer();
  if (editing.value) {
    await cancelEdit();
    clearHideTimer();
  } else {
    editGeometrySnapshot.value = null;
    await setEditingConstraints(false);
    if (isAdjusting.value) {
      if (persistTimer != null) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      await persistApexQOverlayGeometry(getCurrentWindow() as never);
      await applyInteractionMode('display');
      clearHideTimer();
    }
  }
  editing.value = false;
  err.value = '';
  try {
    await getCurrentWindow().hide();
  } catch {
    /* noop */
  }
}

async function setEditingConstraints(active: boolean) {
  const win = getCurrentWindow();
  try {
    await win.setSizeConstraints({
      minWidth: active ? EDIT_MIN_WIDTH : MIN_OVERLAY_WIDTH,
      minHeight: active ? EDIT_MIN_HEIGHT : MIN_OVERLAY_HEIGHT,
      maxWidth: MAX_OVERLAY_WIDTH,
      maxHeight: MAX_OVERLAY_HEIGHT,
    });
    if (!active) return;
    const [size, scale] = await Promise.all([win.innerSize(), win.scaleFactor()]);
    const width = size.width / scale;
    const height = size.height / scale;
    if (width < EDIT_MIN_WIDTH || height < EDIT_MIN_HEIGHT) {
      await win.setSize(new LogicalSize(
        Math.max(width, EDIT_MIN_WIDTH),
        Math.max(height, EDIT_MIN_HEIGHT),
      ));
    }
  } catch {
    /* Keep the editor usable even on runtimes without dynamic constraints. */
  }
}

async function openEdit() {
  if (!payload.value) return;
  if (!editGeometrySnapshot.value) {
    try {
      const win = getCurrentWindow();
      const [position, size] = await Promise.all([win.outerPosition(), win.innerSize()]);
      editGeometrySnapshot.value = {
        position: {x: position.x, y: position.y},
        size: {width: size.width, height: size.height},
      };
    } catch {
      editGeometrySnapshot.value = null;
    }
  }
  clearHideTimer();
  await applyInteractionMode('adjusting');
  await setEditingConstraints(true);
  editing.value = true;
  editR.value = payload.value?.r ?? null;
  editAlpha.value = payload.value?.alpha ?? null;
}

async function cancelEdit() {
  if (persistTimer != null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  editing.value = false;
  err.value = '';
  await setEditingConstraints(false);
  const snapshot = editGeometrySnapshot.value;
  editGeometrySnapshot.value = null;
  if (snapshot) {
    try {
      const win = getCurrentWindow();
      await win.setPosition(new PhysicalPosition(snapshot.position.x, snapshot.position.y));
      await win.setSize(new PhysicalSize(snapshot.size.width, snapshot.size.height));
      await persistApexQOverlayGeometry(win as never);
    } catch {
      /* Keep the current geometry if the native window closed mid-cancel. */
    }
  } else {
    await flushPersistGeometry();
  }
  await applyInteractionMode('display');
  if (payload.value) scheduleHide(payload.value.hideSec);
}

async function applyEdit() {
  const distance = Number(editR.value);
  const alpha = Number(editAlpha.value);
  if (!Number.isFinite(distance) || distance <= 0 || !Number.isFinite(alpha)) {
    err.value = t('apex.apexQ.overlayNeedParams');
    return;
  }
  busy.value = true;
  err.value = '';
  try {
    const theta = await apexQComputeTheta({r: distance, alpha});
    const hideSec = payload.value?.hideSec ?? loadApexQPrefs().overlayHideSec;
    applyPayload({
      theta,
      r: distance,
      alpha,
      hideSec,
    }, {leaveEditor: false});
    await flushPersistGeometry();
    editing.value = false;
    editGeometrySnapshot.value = null;
    await setEditingConstraints(false);
    await applyInteractionMode('display');
  } catch (e) {
    err.value = String(e);
  } finally {
    busy.value = false;
  }
}

function schedulePersistGeometry() {
  if (!isAdjusting.value) return;
  if (persistTimer != null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void persistApexQOverlayGeometry(getCurrentWindow() as never);
  }, 200);
}

async function flushPersistGeometry() {
  if (persistTimer != null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (isAdjusting.value) {
    await persistApexQOverlayGeometry(getCurrentWindow() as never);
  }
}

function lockOverlay() {
  if (editing.value) void cancelEdit();
  else void (async () => {
    await flushPersistGeometry();
    await applyInteractionMode('display');
  })();
}

async function onResizeHandle(e: PointerEvent, direction: ResizeDirection) {
  if (!isAdjusting.value) return;
  e.preventDefault();
  e.stopPropagation();
  try {
    await getCurrentWindow().startResizeDragging(direction);
  } catch {
    /* noop */
  }
}

async function startOverlayDragging(e: PointerEvent) {
  if (!isAdjusting.value) return;
  if (e.button !== 0) return;
  e.preventDefault();
  try {
    await getCurrentWindow().startDragging();
  } catch {
    /* noop */
  }
}

onMounted(async () => {
  makeShellTransparent();
  loadInteractionMode();
  refreshOpacityFromPrefs();
  const win = getCurrentWindow();
  try {
    unlisten = await listen<ApexQOverlayPayload>('apex-q-overlay-result', (e) => {
      applyPayload(e.payload);
      refreshOpacityFromPrefs();
    });
  } catch {
    /* the event bridge can be unavailable in a plain browser preview */
  }
  try {
    unlistenInteraction = await listen<{mode?: unknown}>(APEX_Q_OVERLAY_INTERACTION_EVENT, (e) => {
      const next = parseInteractionMode(e.payload);
      if (next) void applyInteractionMode(next, {broadcast: false});
    });
  } catch {
    /* noop */
  }
  try {
    unlistenPrefs = await listen<{source?: unknown; prefs?: Partial<ApexQPrefs>}>(
      APEX_Q_PREFS_CHANGED_EVENT,
      (e) => {
        if (e.payload?.source === win.label || !e.payload?.prefs || typeof e.payload.prefs !== 'object') return;
        const next = patchApexQPrefs(e.payload.prefs);
        refreshOpacityFromPrefs();
        const nextMode: ApexQOverlayInteractionMode = next.overlayLocked ? 'display' : 'adjusting';
        if (nextMode !== mode.value) void applyInteractionMode(nextMode, {broadcast: false, persist: false});
      },
    );
  } catch {
    /* noop */
  }
  await applyInteractionMode(mode.value, {broadcast: false, persist: false});
  try {
    unlistenGeom.push(
      await listen<{opacity: number}>('apex-q-overlay-prefs-changed', (e) => {
        if (typeof e.payload?.opacity === 'number') {
          overlayOpacity.value = e.payload.opacity;
        } else {
          refreshOpacityFromPrefs();
        }
      }),
    );
  } catch {
    /* noop */
  }
  try {
    unlistenGeom.push(await win.onMoved(() => schedulePersistGeometry()));
    unlistenGeom.push(await win.onResized(() => schedulePersistGeometry()));
  } catch {
    /* noop */
  }
  if (!payload.value) {
    try {
      await win.hide();
    } catch {
      /* A newly-created overlay is already hidden by its native options. */
    }
  }
  ready.value = true;
  try {
    await emitEvent(APEX_Q_OVERLAY_READY_EVENT, {label: win.label});
  } catch {
    /* The creator may already be closing. */
  }
});

onUnmounted(() => {
  editGeometrySnapshot.value = null;
  clearHideTimer();
  if (persistTimer != null) clearTimeout(persistTimer);
  unlisten?.();
  unlistenInteraction?.();
  unlistenPrefs?.();
  for (const u of unlistenGeom) u();
});

watch(editing, (v) => {
  if (v) clearHideTimer();
});

const low = computed(() =>
  payload.value ? `${payload.value.theta.recommendedLow.toFixed(2)}°` : '—',
);
const high = computed(() =>
  payload.value ? `${payload.value.theta.recommendedHigh.toFixed(2)}°` : '—',
);
const detected = computed(() => {
  if (payload.value == null) return '—';
  return `${payload.value.r.toFixed(1)} m · ${payload.value.alpha.toFixed(2)}°`;
});
</script>

<template>
  <div
    v-if="ready && payload"
    class="apex-q-overlay"
    :class="{ 'apex-q-overlay--adjusting': isAdjusting }"
    data-tauri-drag-region
    :style="panelStyle"
  >
    <button
      v-if="isAdjusting"
      class="apex-q-overlay-close"
      type="button"
      data-tauri-drag-region="false"
      :title="t('common.close')"
      :aria-label="t('common.close')"
      @pointerdown.stop
      @click="closeOverlay"
    >
      <v-icon icon="mdi-close" size="14" aria-hidden="true" />
    </button>
    <div class="apex-q-overlay-drag-zone" @pointerdown="isAdjusting && startOverlayDragging($event)">
      <div class="apex-q-overlay-meta">{{ detected }}</div>
      <div class="apex-q-overlay-row">
        <div>
          <div class="label">{{ t('apex.apexQ.recommendedLow') }}</div>
          <div class="value">{{ low }}</div>
        </div>
        <div>
          <div class="label">{{ t('apex.apexQ.recommendedHigh') }}</div>
          <div class="value">{{ high }}</div>
        </div>
      </div>
    </div>

    <div v-if="isAdjusting && !editing" class="apex-q-overlay-actions" data-tauri-drag-region="false">
      <button type="button" class="apex-q-overlay-btn" @click="openEdit">
        {{ t('apex.apexQ.overlayCorrect') }}
      </button>
      <button
        type="button"
        class="apex-q-overlay-btn ghost apex-q-overlay-lock"
        :title="t('apex.apexQ.overlayLockAction')"
        :aria-label="t('apex.apexQ.overlayLockAction')"
        @click="lockOverlay"
      >
        <v-icon icon="mdi-lock" size="14" aria-hidden="true" />
      </button>
    </div>

    <div v-else-if="isAdjusting && editing" class="apex-q-overlay-edit" data-tauri-drag-region="false">
      <div class="apex-q-overlay-fields">
        <label>
          {{ t('apex.apexQ.distance') }}
          <input v-model.number="editR" type="number" step="0.1" />
        </label>
        <label>
          {{ t('apex.apexQ.alpha') }}
          <input v-model.number="editAlpha" type="number" step="0.01" />
        </label>
      </div>
      <p v-if="err" class="apex-q-overlay-err">{{ err }}</p>
      <div class="apex-q-overlay-actions">
        <button type="button" class="apex-q-overlay-btn ghost" @click="cancelEdit">
          {{ t('common.cancel') }}
        </button>
        <button type="button" class="apex-q-overlay-btn" :disabled="busy" @click="applyEdit">
          {{ t('apex.apexQ.recompute') }}
        </button>
      </div>
    </div>

    <!-- 边角拖拽调整大小（类似 OCR 校准框） -->
    <template v-if="isAdjusting">
      <i class="resize-h nw" data-tauri-drag-region="false" @pointerdown="onResizeHandle($event, 'NorthWest')" />
      <i class="resize-h ne" data-tauri-drag-region="false" @pointerdown="onResizeHandle($event, 'NorthEast')" />
      <i class="resize-h sw" data-tauri-drag-region="false" @pointerdown="onResizeHandle($event, 'SouthWest')" />
      <i class="resize-h se" data-tauri-drag-region="false" @pointerdown="onResizeHandle($event, 'SouthEast')" />
      <i class="resize-h n" data-tauri-drag-region="false" @pointerdown="onResizeHandle($event, 'North')" />
      <i class="resize-h s" data-tauri-drag-region="false" @pointerdown="onResizeHandle($event, 'South')" />
      <i class="resize-h e" data-tauri-drag-region="false" @pointerdown="onResizeHandle($event, 'East')" />
      <i class="resize-h w" data-tauri-drag-region="false" @pointerdown="onResizeHandle($event, 'West')" />
    </template>
  </div>
</template>

<style scoped>
.apex-q-overlay {
  height: 100vh;
  width: 100vw;
  box-sizing: border-box;
  padding: 8px 10px 6px;
  /* 不透明度由 panelStyle / overlayOpacity 偏好控制 */
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  color: #f5f5f5;
  user-select: none;
  position: relative;
  overflow: auto;
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  pointer-events: none;
}
.apex-q-overlay--adjusting {
  pointer-events: auto;
}
.apex-q-overlay-close {
  position: absolute;
  top: 2px;
  right: 4px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font-size: 15px;
  cursor: pointer;
  line-height: 1;
  z-index: 2;
  padding: 2px 6px;
}
.apex-q-overlay-close:hover {
  color: #fff;
}
.apex-q-overlay-drag-zone {
  cursor: move;
  touch-action: none;
}
.apex-q-overlay-meta {
  margin-top: 0;
  margin-right: 18px;
  font-size: 10px;
  opacity: 0.72;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.apex-q-overlay-row {
  display: flex;
  gap: 10px;
  margin-top: 2px;
}
.apex-q-overlay-row > div {
  flex: 1;
  min-width: 0;
}
.label {
  font-size: 10px;
  opacity: 0.72;
}
.value {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.01em;
  margin-top: 1px;
  line-height: 1.15;
}
.apex-q-overlay-actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  justify-content: flex-end;
}
.apex-q-overlay-btn {
  border: none;
  border-radius: 5px;
  padding: 2px 10px;
  font-size: 11px;
  cursor: pointer;
  background: rgba(37, 99, 235, 0.9);
  color: #fff;
}
.apex-q-overlay-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.apex-q-overlay-btn.ghost {
  background: rgba(255, 255, 255, 0.12);
}
.apex-q-overlay-lock {
  min-width: 26px;
  padding: 2px 6px;
}
.apex-q-overlay-edit {
  margin-top: 4px;
}
.apex-q-overlay-fields {
  display: flex;
  gap: 6px;
}
.apex-q-overlay-fields label {
  flex: 1;
  font-size: 10px;
  opacity: 0.85;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.apex-q-overlay-fields input {
  width: 100%;
  box-sizing: border-box;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  padding: 2px 5px;
  font-size: 12px;
}
.apex-q-overlay-err {
  margin: 4px 0 0;
  font-size: 10px;
  color: #fbbf24;
}
.resize-h {
  position: absolute;
  z-index: 3;
  box-sizing: border-box;
  background: transparent;
  width: 18px;
  height: 18px;
}
.resize-h::after {
  content: '';
  position: absolute;
  inset: 5px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(80, 140, 255, 0.9);
  border-radius: 2px;
}
.resize-h.nw { left: 0; top: 0; cursor: nwse-resize; }
.resize-h.ne { right: 0; top: 0; cursor: nesw-resize; }
.resize-h.sw { left: 0; bottom: 0; cursor: nesw-resize; }
.resize-h.se { right: 0; bottom: 0; cursor: nwse-resize; }
.resize-h.n { left: calc(50% - 9px); top: 0; cursor: ns-resize; }
.resize-h.s { left: calc(50% - 9px); bottom: 0; cursor: ns-resize; }
.resize-h.w { left: 0; top: calc(50% - 9px); cursor: ew-resize; }
.resize-h.e { right: 0; top: calc(50% - 9px); cursor: ew-resize; }
</style>

<style>
/* 悬浮窗：整页透明，露出系统 Acrylic */
html:has(.apex-q-overlay),
html:has(.apex-q-overlay) body,
html:has(.apex-q-overlay) #app,
html:has(.apex-q-overlay) .v-application,
html:has(.apex-q-overlay) .v-application__wrap {
  background: transparent !important;
  background-color: transparent !important;
}
</style>
