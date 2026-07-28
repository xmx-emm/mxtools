<script setup lang="ts">
import {computed} from 'vue';

const props = defineProps<{
  modelValue: string;
  blockedInputs: string[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const SIMPLE_KEYS = [
  ...'1234567890'.split(''),
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  '`', '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/',
];
const NAMED_KEYS = [
  'SPACE', 'TAB', 'ENTER', 'ESCAPE', 'BACKSPACE', 'CAPSLOCK',
  'LSHIFT', 'RSHIFT', 'LCTRL', 'RCTRL', 'LALT', 'RALT',
  'UPARROW', 'DOWNARROW', 'LEFTARROW', 'RIGHTARROW',
  'INS', 'DEL', 'HOME', 'END', 'PGUP', 'PGDN',
  'MOUSE1', 'MOUSE2', 'MOUSE3', 'MOUSE4', 'MOUSE5', 'MWHEELUP', 'MWHEELDOWN',
  'KP_END', 'KP_DOWNARROW', 'KP_PGDN', 'KP_LEFTARROW', 'KP_5', 'KP_RIGHTARROW',
  'KP_HOME', 'KP_UPARROW', 'KP_PGUP', 'KP_SLASH', 'KP_MULTIPLY', 'KP_MINUS',
  'KP_PLUS', 'KP_DEL',
  ...Array.from({length: 12}, (_, index) => `F${index + 1}`),
];

const items = computed(() => {
  const blocked = new Set(props.blockedInputs.map(value => value.toUpperCase()));
  return [...SIMPLE_KEYS, ...NAMED_KEYS].filter(
    value => value.toUpperCase() === props.modelValue.toUpperCase() || !blocked.has(value.toUpperCase()),
  );
});
</script>

<template>
  <v-select
    :model-value="modelValue"
    :items="items"
    density="compact"
    variant="outlined"
    hide-details
    class="binding-select"
    @update:model-value="emit('update:modelValue', String($event))"
  />
</template>

<style scoped>
.binding-select {
  width: 150px;
  min-width: 120px;
}
</style>
