<script setup lang="ts">
import {onUnmounted, ref} from 'vue';
import {
  NAV_COLLAPSE_SNAP_THRESHOLD,
  NAV_MIN_WIDTH,
  snapNavPanelWidth,
} from '@/constants/nav_layout.ts';
import {createRafScheduler} from '@/utils/raf.ts';

const props = defineProps<{
  modelValue: number;
  min: number;
  max: number;
  label: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [width: number];
}>();

const isDragging = ref(false);
const isHovered = ref(false);
const KEYBOARD_STEP = 16;

function clamp(width: number): number {
  return Math.min(props.max, Math.max(props.min, width));
}

/** 拖动中低于吸附阈值时立即收成图标宽度,避免中间态出现横向滚动条 */
function applyDragWidth(raw: number): number {
  const clamped = clamp(raw);
  if (clamped < NAV_COLLAPSE_SNAP_THRESHOLD) {
    return NAV_MIN_WIDTH;
  }
  return clamped;
}

function onKeyDown(event: KeyboardEvent) {
  let next: number | null = null;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
    next = props.modelValue - KEYBOARD_STEP;
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
    next = props.modelValue + KEYBOARD_STEP;
  } else if (event.key === 'Home') {
    next = props.min;
  } else if (event.key === 'End') {
    next = props.max;
  }
  if (next == null) return;

  event.preventDefault();
  emit('update:modelValue', snapNavPanelWidth(next, props.max));
}

let pendingWidth: number | null = null;
const widthScheduler = createRafScheduler(() => {
  if (pendingWidth == null) return;
  const next = pendingWidth;
  pendingWidth = null;
  if (next !== props.modelValue) {
    emit('update:modelValue', next);
  }
});

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  isDragging.value = true;
  const startX = e.clientX;
  const startWidth = props.modelValue;

  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);

  function onPointerMove(ev: PointerEvent) {
    pendingWidth = applyDragWidth(startWidth + (ev.clientX - startX));
    widthScheduler.schedule();
  }

  function finish(ev: PointerEvent) {
    isDragging.value = false;
    target.releasePointerCapture(ev.pointerId);
    target.removeEventListener('pointermove', onPointerMove);
    target.removeEventListener('pointerup', finish);
    target.removeEventListener('pointercancel', finish);
    widthScheduler.cancel();
    pendingWidth = null;
    emit('update:modelValue', snapNavPanelWidth(startWidth + (ev.clientX - startX), props.max));
  }
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerup', finish);
  target.addEventListener('pointercancel', finish);
}

onUnmounted(() => {
  widthScheduler.cancel();
});
</script>
<template>
  <div
    class="nav-resize-handle"
    :class="{ 'nav-resize-handle--active': isDragging || isHovered }"
    role="separator"
    aria-orientation="vertical"
    tabindex="0"
    :aria-label="props.label"
    :aria-valuemin="props.min"
    :aria-valuemax="props.max"
    :aria-valuenow="props.modelValue"
    @pointerdown="onPointerDown"
    @keydown="onKeyDown"
    @pointerenter="isHovered = true"
    @pointerleave="isHovered = false"
  />
</template>

<style scoped>
.nav-resize-handle {
  flex: 0 0 1px;
  width: 1px;
  align-self: stretch;
  cursor: col-resize;
  position: relative;
  user-select: none;
  touch-action: none;
  z-index: 2;
  background: rgba(var(--v-border-color), 0.08);
  transition: background 0.15s ease;
}

/* 视觉 1px,两侧扩大拖拽热区 */
.nav-resize-handle::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  right: -4px;
}

/* Keep the resize affordance quiet until the pointer or keyboard reaches it. */
.nav-resize-handle::after {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 3px;
  height: 34px;
  content: '';
  border-radius: 2px;
  background: rgb(var(--v-theme-primary));
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -50%) scaleY(0.5);
  transform-origin: center;
  transition:
    opacity var(--app-motion-fast) var(--app-ease-standard),
    transform var(--app-motion-base) var(--app-ease-emphasized);
}

.nav-resize-handle:hover,
.nav-resize-handle--active,
.nav-resize-handle:focus-visible {
  background: rgba(var(--v-border-color), 0.16);
}

.nav-resize-handle:hover::after,
.nav-resize-handle--active::after,
.nav-resize-handle:focus-visible::after {
  opacity: 0.72;
  transform: translate(-50%, -50%) scaleY(1);
}

.nav-resize-handle:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .nav-resize-handle::after {
    transition: none;
    transform: translate(-50%, -50%);
  }
}
</style>
