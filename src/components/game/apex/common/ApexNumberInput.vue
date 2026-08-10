<script setup lang="ts">
import {ref} from 'vue';

const props = withDefaults(defineProps<{
  modelValue: number | string
  step?: number | string
  min?: number | string
  max?: number | string
  ariaLabel?: string
  disabled?: boolean
}>(), {
  step: 1
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: number): void
}>();

const invalid = ref(false);

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
    @input="onInput"
    @blur="onBlur"
    @click.stop=""
    @mousedown.stop=""
    @mouseup.stop=""
    @pointerdown.stop=""
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
