<script setup lang="ts">
import {ref} from 'vue';
import {
  NAV_COLLAPSE_SNAP_THRESHOLD,
  NAV_MIN_WIDTH,
  snapNavPanelWidth,
} from '@/constants/nav_layout.ts';
const props = defineProps<{
  modelValue: number;
  min: number;
  max: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [width: number];
}>();

const isDragging = ref(false);
const isHovered = ref(false);

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
function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return;
  e.preventDefault();
  isDragging.value = true;
  const startX = e.clientX;
  const startWidth = props.modelValue;

  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);

  function onPointerMove(ev: PointerEvent) {
    emit('update:modelValue', applyDragWidth(startWidth + (ev.clientX - startX)));
  }

  function finish(ev: PointerEvent) {
    isDragging.value = false;
    target.releasePointerCapture(ev.pointerId);
    target.removeEventListener('pointermove', onPointerMove);
    target.removeEventListener('pointerup', finish);
    target.removeEventListener('pointercancel', finish);
    emit('update:modelValue', snapNavPanelWidth(startWidth + (ev.clientX - startX), props.max));
  }
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerup', finish);
  target.addEventListener('pointercancel', finish);
}
</script>
<template>
  <div
    class="nav-resize-handle"
    :class="{ 'nav-resize-handle--active': isDragging || isHovered }"
    role="separator"
    aria-orientation="vertical"
    @pointerdown="onPointerDown"
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

.nav-resize-handle:hover,
.nav-resize-handle--active {
  background: rgba(var(--v-border-color), 0.16);
}
</style>
