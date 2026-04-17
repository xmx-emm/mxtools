<script setup lang="ts">
import {computed} from 'vue';

const props = withDefaults(defineProps<{
  modelValue: number | string
  step?: number | string
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
    class="apex_number_input"
    @click.stop=""
    @mousedown.stop=""
    @mouseup.stop=""
    @pointerdown.stop=""
  />
</template>

<style scoped>
.apex_number_input {
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
