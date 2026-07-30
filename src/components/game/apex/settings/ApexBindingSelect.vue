<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue';
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
}>(), {clearable: false});

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const {t} = useI18n();
const root = ref<HTMLButtonElement | null>(null);
const recording = ref(false);
let pendingContextMenu = false;
let pendingContextMenuTimer: number | null = null;

const displayText = computed(() => {
  if (recording.value) return t('apexGameSettings.bindingRecording');
  if (!props.modelValue) return t('apexGameSettings.bindingUnassigned');
  return props.modelValue.length === 1 ? props.modelValue.toUpperCase() : props.modelValue;
});

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
  if (recording.value) return;
  recording.value = true;
  beginShortcutRecording();
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('mousedown', onMouseDown, true);
  window.addEventListener('wheel', onWheel, {capture: true, passive: false});
  window.addEventListener('blur', stopRecording);
}

function toggleRecording() {
  if (recording.value) stopRecording();
  else startRecording();
}

function clearBinding() {
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
  if (event.button === 0 && root.value?.contains(event.target as Node)) return;
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

onMounted(() => window.addEventListener('contextmenu', onContextMenu, true));

onBeforeUnmount(() => {
  stopRecording();
  clearPendingContextMenu();
  window.removeEventListener('contextmenu', onContextMenu, true);
});
</script>

<template>
  <div class="binding-capture-wrap">
    <button
      ref="root"
      type="button"
      class="binding-capture"
      :class="{'binding-capture--recording': recording}"
      :aria-label="t('apexGameSettings.bindingEdit')"
      :title="t('apexGameSettings.bindingEdit')"
      @click="toggleRecording"
    >
      {{ displayText }}
    </button>
    <button
      v-if="clearable && modelValue"
      type="button"
      class="binding-clear"
      :aria-label="t('apexGameSettings.bindingClear')"
      :title="t('apexGameSettings.bindingClear')"
      @click.stop="clearBinding"
    >×</button>
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
  right: 4px;
  display: grid;
  width: 20px;
  height: 20px;
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
</style>
