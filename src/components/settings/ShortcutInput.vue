<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {
  eventToAccelerator,
  formatAcceleratorDisplay,
  isValidAlterQAccelerator,
  isValidAppAccelerator,
  isValidGlobalAccelerator,
} from '@/utils/shortcut-keys.ts';
import {beginShortcutRecording, endShortcutRecording} from '@/utils/shortcut-recording.ts';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    disabled?: boolean;
    /** global：必须带修饰键；app：也需至少含一个修饰键；alterQ：允许单独 F1–F12 */
    scope?: 'app' | 'global' | 'alterQ';
  }>(),
  { scope: 'app' },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'capture-error': [reason: 'invalid' | 'empty'];
}>();

const { t } = useI18n();
const recording = ref(false);
const preview = ref('');

const displayText = computed(() => {
  if (recording.value) {
    return preview.value
      ? formatAcceleratorDisplay(preview.value)
      : t('settings.shortcutRecording');
  }
  return props.modelValue
    ? formatAcceleratorDisplay(props.modelValue)
    : t('settings.shortcutEmpty');
});

function stopRecording() {
  if (!recording.value) return;
  recording.value = false;
  preview.value = '';
  endShortcutRecording();
  window.removeEventListener('keydown', onKeyDown, true);
  window.removeEventListener('blur', onBlur);
}

function startRecording() {
  if (props.disabled || recording.value) return;
  recording.value = true;
  preview.value = '';
  beginShortcutRecording();
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('blur', onBlur);
}

function onBlur() {
  stopRecording();
}

function isValidForScope(accel: string): boolean {
  if (props.scope === 'global') return isValidGlobalAccelerator(accel);
  if (props.scope === 'alterQ') return isValidAlterQAccelerator(accel);
  return isValidAppAccelerator(accel);
}

function onKeyDown(e: KeyboardEvent) {
  if (!recording.value) return;
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    stopRecording();
    return;
  }

  if (e.key === 'Backspace' || e.key === 'Delete') {
    emit('update:modelValue', '');
    emit('capture-error', 'empty');
    stopRecording();
    return;
  }

  const accel = eventToAccelerator(e);
  if (!accel) {
    preview.value = [
      e.ctrlKey || e.metaKey ? 'Ctrl' : null,
      e.altKey ? 'Alt' : null,
      e.shiftKey ? 'Shift' : null,
    ].filter(Boolean).join('+');
    return;
  }

  preview.value = accel;
  if (!isValidForScope(accel)) {
    emit('capture-error', 'invalid');
    stopRecording();
    return;
  }

  emit('update:modelValue', accel);
  stopRecording();
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) stopRecording();
  },
);

onBeforeUnmount(stopRecording);
</script>

<template>
  <button
    type="button"
    class="shortcut-pill"
    :class="{
      'shortcut-pill--recording': recording,
      'shortcut-pill--disabled': disabled,
      'shortcut-pill--empty': !modelValue && !recording,
    }"
    :disabled="disabled"
    :aria-label="t('settings.shortcutEditHint')"
    @click="startRecording"
  >
    {{ displayText }}
  </button>
</template>

<style scoped>
.shortcut-pill {
  min-width: 148px;
  height: 36px;
  padding: 0 18px;
  border: none;
  border-radius: 999px;
  background: rgba(var(--v-theme-surface-variant), 0.55);
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
  user-select: none;
  white-space: nowrap;
}

.shortcut-pill:hover:not(:disabled) {
  background: rgba(var(--v-theme-surface-variant), 0.85);
}

.shortcut-pill--recording {
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  box-shadow: inset 0 0 0 1.5px rgba(var(--v-theme-primary), 0.45);
}

.shortcut-pill--empty {
  color: rgba(var(--v-theme-on-surface), 0.38);
}

.shortcut-pill--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
