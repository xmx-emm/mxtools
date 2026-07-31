<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {
  apexBindingFromKeyboardCode,
  apexBindingFromMouseButton,
  apexBindingFromWheelDelta,
} from '@/utils/game/apex_game_settings.ts';
import {beginShortcutRecording, endShortcutRecording} from '@/utils/shortcut-recording.ts';

const props = withDefaults(defineProps<{
  modelValue: string;
  clearable?: boolean;
  actionLabel: string;
  slotNumber: number;
  disabled?: boolean;
}>(), {clearable: false, disabled: false});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const {t} = useI18n();
const root = ref<HTMLButtonElement | null>(null);
const recording = ref(false);
let pendingContextMenu = false;
let pendingContextMenuTimer: number | null = null;
const RECORDING_START_EVENT = 'mx-apex-binding-recording-start';
const INTERACTIVE_RECORDING_TARGETS = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="radio"]',
  '[role="tab"]',
  '[role="slider"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const displayText = computed(() => {
  if (recording.value) return t('apexGameSettings.bindingRecording');
  if (!props.modelValue) return t('apexGameSettings.bindingUnassigned');
  return props.modelValue.length === 1 ? props.modelValue.toUpperCase() : props.modelValue;
});
const editLabel = computed(() => t('apexGameSettings.bindingEditSlot', {
  action: props.actionLabel,
  slot: props.slotNumber,
}));
const recordingLabel = computed(() => t('apexGameSettings.bindingRecordingSlot', {
  action: props.actionLabel,
  slot: props.slotNumber,
}));
const clearLabel = computed(() => t('apexGameSettings.bindingClearSlot', {
  action: props.actionLabel,
  slot: props.slotNumber,
}));

function stopRecording() {
  if (!recording.value) return;
  recording.value = false;
  endShortcutRecording();
  window.removeEventListener('keydown', onKeyDown, true);
  window.removeEventListener('mousedown', onMouseDown, true);
  window.removeEventListener('wheel', onWheel, true);
  window.removeEventListener('blur', stopRecording);
}

function clearPendingContextMenu() {
  pendingContextMenu = false;
  if (pendingContextMenuTimer !== null) {
    window.clearTimeout(pendingContextMenuTimer);
    pendingContextMenuTimer = null;
  }
}

function armPendingContextMenu() {
  clearPendingContextMenu();
  pendingContextMenu = true;
  pendingContextMenuTimer = window.setTimeout(clearPendingContextMenu, 1000);
}

function onContextMenu(event: MouseEvent) {
  if (!recording.value && !pendingContextMenu) return;
  event.preventDefault();
  event.stopPropagation();
  clearPendingContextMenu();
}

function startRecording() {
  if (props.disabled || recording.value) return;
  window.dispatchEvent(new CustomEvent(RECORDING_START_EVENT, {detail: root.value}));
  recording.value = true;
  beginShortcutRecording();
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('mousedown', onMouseDown, true);
  window.addEventListener('wheel', onWheel, {capture: true, passive: false});
  window.addEventListener('blur', stopRecording);
}

function toggleRecording() {
  if (props.disabled) return;
  if (recording.value) stopRecording();
  else startRecording();
}

function clearBinding() {
  if (props.disabled) return;
  stopRecording();
  emit('update:modelValue', '');
}

function commit(input: string | null) {
  if (!input) return;
  emit('update:modelValue', input);
  stopRecording();
}

function onKeyDown(event: KeyboardEvent) {
  if (!recording.value) return;
  event.preventDefault();
  event.stopPropagation();
  commit(apexBindingFromKeyboardCode(event.code));
}

function onMouseDown(event: MouseEvent) {
  if (!recording.value) return;
  const target = event.target;
  const insideCapture = target instanceof Node && Boolean(root.value?.contains(target));
  const interactive = event.composedPath().some(node => (
    node instanceof Element && node.matches(INTERACTIVE_RECORDING_TARGETS)
  ));
  if (interactive && !insideCapture) {
    stopRecording();
    return;
  }
  if (event.button === 0 && insideCapture) return;
  const input = apexBindingFromMouseButton(event.button);
  if (!input) return;
  if (event.button === 2) armPendingContextMenu();
  event.preventDefault();
  event.stopPropagation();
  commit(input);
}

function onWheel(event: WheelEvent) {
  if (!recording.value) return;
  const input = apexBindingFromWheelDelta(event.deltaY);
  if (!input) return;
  event.preventDefault();
  event.stopPropagation();
  commit(input);
}

function onOtherRecordingStarted(event: Event) {
  const source = (event as CustomEvent<HTMLElement | null>).detail;
  if (source !== root.value) stopRecording();
}

watch(() => props.disabled, disabled => {
  if (disabled) stopRecording();
});

onMounted(() => {
  window.addEventListener('contextmenu', onContextMenu, true);
  window.addEventListener(RECORDING_START_EVENT, onOtherRecordingStarted);
});

onBeforeUnmount(() => {
  stopRecording();
  clearPendingContextMenu();
  window.removeEventListener('contextmenu', onContextMenu, true);
  window.removeEventListener(RECORDING_START_EVENT, onOtherRecordingStarted);
});
</script>

<template>
  <div class="binding-capture-wrap">
    <button
      ref="root"
      type="button"
      class="binding-capture"
      :class="{'binding-capture--recording': recording}"
      :aria-label="recording ? recordingLabel : editLabel"
      :aria-pressed="recording"
      :title="editLabel"
      :disabled="disabled"
      @click="toggleRecording"
    >
      {{ displayText }}
    </button>
    <button
      v-if="clearable && modelValue"
      type="button"
      class="binding-clear"
      :aria-label="clearLabel"
      :title="clearLabel"
      :disabled="disabled"
      @click.stop="clearBinding"
    ><v-icon icon="mdi-close" size="14"/></button>
    <span class="binding-live" aria-live="polite">
      {{ recording ? recordingLabel : '' }}
    </span>
  </div>
</template>

<style scoped>
.binding-capture-wrap {
  position: relative;
  min-width: 0;
}

.binding-capture {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: var(--app-control-height-compact);
  padding: 0 28px 0 10px;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.88);
  background: rgba(var(--v-theme-surface), 0.78);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.18);
  border-radius: 4px;
  font: inherit;
  font-size: 12px;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color var(--app-motion-fast) var(--app-ease-standard),
    background-color var(--app-motion-fast) var(--app-ease-standard),
    box-shadow var(--app-motion-fast) var(--app-ease-standard);
}

.binding-clear {
  position: absolute;
  top: 50%;
  right: 2px;
  display: grid;
  width: 24px;
  height: 24px;
  padding: 0;
  color: rgba(var(--v-theme-on-surface), 0.5);
  background: transparent;
  border: 0;
  border-radius: 3px;
  font: inherit;
  line-height: 1;
  cursor: pointer;
  place-items: center;
  transform: translateY(-50%);
}

.binding-live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.binding-clear:hover,
.binding-clear:focus-visible {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
  outline: none;
}

.binding-capture:hover,
.binding-capture:focus-visible {
  border-color: rgba(var(--v-theme-primary), 0.78);
}

.binding-capture:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.14);
}

.binding-capture--recording {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
  border-color: rgba(var(--v-theme-primary), 0.78);
}

.binding-capture:disabled,
.binding-clear:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
