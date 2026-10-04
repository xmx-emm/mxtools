<script setup lang="ts">
import {isTauri} from '@tauri-apps/api/core';
import {onBeforeUnmount, ref} from 'vue';
import {getCursorPosition, restoreCursorPosition} from '@/ipc/commands.ts';

const props = withDefaults(defineProps<{
  modelValue: number | string
  step?: number | string
  min?: number | string
  max?: number | string
  ariaLabel?: string
  disabled?: boolean
  /** 允许按住鼠标左右拖动，按 step 增减数值。 */
  dragAdjustable?: boolean
  /** 拖动多少像素调整一个 step。 */
  dragPixelsPerStep?: number | string
}>(), {
  step: 1,
  dragAdjustable: false,
  dragPixelsPerStep: 8,
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: number): void
}>();

const invalid = ref(false);
const dragging = ref(false);
const DRAG_ACTIVATION_PX = 3;
let drag_pointer_id: number | null = null;
let drag_start_x = 0;
let drag_start_value = 0;
let drag_accumulated_x = 0;
let pointer_lock_target: HTMLInputElement | null = null;
let pointer_lock_failed = false;
let pointer_lock_acquired = false;
let drag_start_screen_x = 0;
let drag_start_screen_y = 0;
let native_drag_start: Promise<[number, number] | null> | null = null;
let previous_document_cursor = '';

onBeforeUnmount(() => {
  if (drag_pointer_id !== null) {
    finishDrag(pointer_lock_target, drag_pointer_id);
  }
});

function numericBound(value: number | string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validNumber(raw: string): number | null {
  if (!raw.trim()) return null;
  const number = Number(raw);
  if (!Number.isFinite(number)) return null;
  const min = numericBound(props.min);
  const max = numericBound(props.max);
  if ((min !== null && number < min) || (max !== null && number > max)) return null;
  return number;
}

function numericValue(value: number | string): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numericStep(): number {
  const step = numericValue(props.step);
  return step !== null && step > 0 ? step : 1;
}

function numericDragPixelsPerStep(): number {
  const pixels = numericValue(props.dragPixelsPerStep);
  return pixels !== null && pixels > 0 ? pixels : 8;
}

function clamp(value: number): number {
  const min = numericBound(props.min);
  const max = numericBound(props.max);
  return Math.min(max ?? value, Math.max(min ?? value, value));
}

function roundToStep(value: number, step: number): number {
  const precision = Math.max(0, (String(step).split('.')[1] ?? '').length);
  return Number(value.toFixed(precision));
}

function onInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const number = validNumber(target.value);
  invalid.value = number === null;
  if (number !== null) emit('update:modelValue', number);
}

function onBlur(event: FocusEvent) {
  const target = event.target as HTMLInputElement;
  if (validNumber(target.value) === null) {
    target.value = String(props.modelValue);
  }
  invalid.value = false;
}

function onPointerDown(event: PointerEvent) {
  if (!props.dragAdjustable || props.disabled || event.button !== 0) return;
  const value = numericValue(props.modelValue);
  if (value === null) return;
  drag_pointer_id = event.pointerId;
  drag_start_x = event.clientX;
  drag_start_screen_x = event.screenX;
  drag_start_screen_y = event.screenY;
  native_drag_start = isTauri()
    ? getCursorPosition().catch(() => null)
    : null;
  drag_start_value = value;
  drag_accumulated_x = 0;
  dragging.value = false;
  const target = event.currentTarget as HTMLInputElement;
  pointer_lock_target = target;
  pointer_lock_failed = false;
  pointer_lock_acquired = false;
  previous_document_cursor = document.documentElement.style.cursor;
  window.addEventListener('blur', onWindowBlur, {once: true});
  target.setPointerCapture?.(event.pointerId);
  // Keep the native click/focus path intact. Drag mode activates only after
  // the pointer has moved far enough to distinguish it from a click.
}

function activateDrag(target: HTMLInputElement) {
  if (dragging.value) return;
  dragging.value = true;
  document.documentElement.style.cursor = 'none';
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('pointerlockerror', onPointerLockError);
  if (typeof target.requestPointerLock === 'function') {
    // Pointer Lock restores the pointer to its pre-drag location when it exits.
    // Some WebViews expose this as a Promise while older DOM typings still say
    // `void`; handle both without allowing a rejected request to become an
    // unhandled browser error.
    const request = (target.requestPointerLock as unknown as () => void | Promise<void>)();
    if (request && typeof request.catch === 'function') {
      request.catch(() => undefined);
    }
  }
}

function onPointerMove(event: PointerEvent) {
  if (drag_pointer_id !== event.pointerId) return;
  const target = event.currentTarget as HTMLInputElement;
  const client_delta = event.clientX - drag_start_x;
  if (!dragging.value && Math.abs(client_delta) < DRAG_ACTIVATION_PX) return;
  activateDrag(target);
  const pointer_locked = !pointer_lock_failed && document.pointerLockElement === target;
  const delta = pointer_locked
    ? (drag_accumulated_x += event.movementX)
    : client_delta;
  const step = numericStep();
  const steps = Math.round(delta / numericDragPixelsPerStep());
  const next = clamp(roundToStep(drag_start_value + steps * step, step));
  if (next !== Number(props.modelValue)) {
    emit('update:modelValue', next);
  }
  if (delta !== 0) {
    dragging.value = true;
    event.preventDefault();
  }
}

function onPointerUp(event: PointerEvent) {
  if (drag_pointer_id !== event.pointerId) return;
  const target = pointer_lock_target ?? event.currentTarget as HTMLInputElement;
  finishDrag(target, event.pointerId);
}

function finishDrag(target: HTMLInputElement | null, pointer_id: number | null) {
  // Pointer Lock is only an input helper. Tauri always restores the native
  // desktop cursor explicitly so the WebView cannot leave it displaced.
  const shouldRestoreNativeCursor = isTauri() && dragging.value;
  const restoreX = drag_start_screen_x;
  const restoreY = drag_start_screen_y;
  const nativeStart = native_drag_start;
  const wasPointerLocked = target !== null && document.pointerLockElement === target;
  drag_pointer_id = null;
  let pointerLockExit: Promise<void> = Promise.resolve();
  if (wasPointerLocked) {
    pointerLockExit = new Promise<void>((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        document.removeEventListener('pointerlockchange', onExit);
        resolve();
      };
      const onExit = () => {
        if (document.pointerLockElement === null) settle();
      };
      const timeout = window.setTimeout(settle, 50);
      document.addEventListener('pointerlockchange', onExit);
      try {
        document.exitPointerLock();
      } catch {
        settle();
      }
    });
  }
  if (target && pointer_id !== null && target.hasPointerCapture?.(pointer_id)) {
    target.releasePointerCapture(pointer_id);
  }
  window.removeEventListener('blur', onWindowBlur);
  document.removeEventListener('pointerlockchange', onPointerLockChange);
  document.removeEventListener('pointerlockerror', onPointerLockError);
  document.documentElement.style.cursor = previous_document_cursor;
  if (shouldRestoreNativeCursor) {
    void (async () => {
      const nativePosition = await nativeStart;
      const [x, y] = nativePosition ?? [restoreX, restoreY];
      // Wait for the native lock to exit (or the short safety timeout) before
      // restoring, so a late pointerlockchange cannot overwrite our position.
      await pointerLockExit;
      await restoreCursorPosition(x, y).catch(() => undefined);
    })();
  }
  previous_document_cursor = '';
  drag_start_x = 0;
  drag_accumulated_x = 0;
  drag_start_screen_x = 0;
  drag_start_screen_y = 0;
  native_drag_start = null;
  pointer_lock_target = null;
  pointer_lock_failed = false;
  pointer_lock_acquired = false;
  dragging.value = false;
}

function onLostPointerCapture(event: Event) {
  if (drag_pointer_id === null) return;
  finishDrag(event.currentTarget as HTMLInputElement, drag_pointer_id);
}

function onWindowBlur() {
  if (drag_pointer_id === null) return;
  finishDrag(pointer_lock_target, drag_pointer_id);
}

function onPointerLockChange() {
  // Pointer Lock restores the system cursor to the position it had when lock
  // was acquired. If the browser/WebView exits lock unexpectedly, ending the
  // drag here prevents a stale hidden cursor or captured pointer.
  if (drag_pointer_id === null) return;
  if (pointer_lock_target && document.pointerLockElement === pointer_lock_target) {
    pointer_lock_acquired = true;
    return;
  }
  if (pointer_lock_target && document.pointerLockElement !== pointer_lock_target) {
    // A null element before acquisition is the normal permission-denied
    // fallback; only end the drag when an acquired lock exits unexpectedly.
    if (pointer_lock_acquired) {
      finishDrag(pointer_lock_target, drag_pointer_id);
    }
  }
}

function onPointerLockError() {
  // Pointer Lock is permission-gated in embedded browsers. Keep the drag
  // usable via clientX fallback, but always release capture and restore CSS
  // cursor state through the common finish path.
  pointer_lock_failed = true;
}
</script>

<template>
  <input
    :value="modelValue"
    type="number"
    :step="step"
    :min="min"
    :max="max"
    :aria-label="ariaLabel"
    :aria-invalid="invalid || undefined"
    :disabled="disabled"
    class="apex_number_input"
    :class="{
      'apex_number_input--drag-adjustable': dragAdjustable,
      'apex_number_input--dragging': dragging,
    }"
    @input="onInput"
    @blur="onBlur"
    @click.stop=""
    @mousedown.stop=""
    @mouseup.stop=""
    @pointerdown.stop="onPointerDown"
    @pointermove.stop="onPointerMove"
    @pointerup.stop="onPointerUp"
    @pointercancel.stop="onPointerUp"
    @lostpointercapture.stop="onLostPointerCapture"
    @selectstart.stop.prevent="dragAdjustable && dragging"
  />
</template>

<style scoped>
.apex_number_input {
  box-sizing: border-box;
  min-width: 72px;
  max-width: 72px;
  min-height: var(--app-control-height-compact);
  height: var(--app-control-height-compact);
  padding: 0 4px;
  font-size: 12px;
  text-align: center;
  color: rgba(var(--v-theme-on-surface), 0.92);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.18);
  border-radius: 4px;
  outline: none;
  background: rgba(var(--v-theme-surface), 0.78);
  transition: border-color var(--app-motion-fast) var(--app-ease-standard),
    box-shadow var(--app-motion-fast) var(--app-ease-standard);
}

.apex_number_input:hover {
  border-color: rgba(var(--v-theme-on-surface), 0.32);
}

.apex_number_input--drag-adjustable {
  cursor: ew-resize;
  touch-action: none;
}

.apex_number_input--drag-adjustable.apex_number_input--dragging {
  cursor: none;
  user-select: none;
}

.apex_number_input:focus-visible {
  border-color: rgba(var(--v-theme-primary), 0.78);
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.14);
}

.apex_number_input[aria-invalid="true"] {
  border-color: rgb(var(--v-theme-error));
}

.apex_number_input:disabled {
  cursor: not-allowed;
}

</style>
