<script setup lang="ts">
import {computed} from 'vue';

const props = withDefaults(defineProps<{
  modelValue: number | string;
  step?: number | string;
  min?: number;
  max?: number;
}>(), {
  step: 1,
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: number): void
}>();

function clamp(n: number): number {
  let x = n;
  if (props.min && Number.isFinite(props.min)) {
    x = Math.max(props.min, x);
  }
  if (props.max && Number.isFinite(props.max)) {
    x = Math.min(props.max, x);
  }
  return x;
}

const value_proxy = computed({
  get: () => props.modelValue,
  set: (value: number | string) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    emit('update:modelValue', clamp(n));
  },
});
</script>

<template>
  <input
    v-model.number="value_proxy"
    type="number"
    :step="step"
    :min="min"
    :max="max"
    class="pubg_number_input"
    @click.stop=""
    @mousedown.stop=""
    @mouseup.stop=""
    @pointerdown.stop=""
  />
</template>

<style scoped>
.pubg_number_input {
  min-width: 72px;
  max-width: 72px;
  min-height: 24px;
  padding: 0 4px;
  font-size: 12px;
  text-align: center;
  border: none;
  outline: none;
  box-shadow: none;
  background: transparent;
}
</style>
