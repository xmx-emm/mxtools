<script setup lang="ts">
import {computed} from 'vue';

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

const value_proxy = computed({
  get: () => props.modelValue,
  set: (value: number | string) => {
    emit('update:modelValue', Number(value));
  }
});
</script>

<template>
  <input
    v-model.number="value_proxy"
    type="number"
    :step="step"
    :min="min"
    :max="max"
    :aria-label="ariaLabel"
    :disabled="disabled"
    class="apex_number_input"
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

.apex_number_input:disabled {
  cursor: not-allowed;
}

</style>
