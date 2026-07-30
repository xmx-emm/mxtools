<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref} from 'vue';

const emit = defineEmits<{
  ready: [element: HTMLElement | null];
  pointerdown: [event: PointerEvent];
  pointermove: [event: PointerEvent];
  pointerup: [event: PointerEvent];
  pointercancel: [event: PointerEvent];
  wheel: [event: WheelEvent];
}>();

const element = ref<HTMLElement | null>(null);

onMounted(() => emit('ready', element.value));
onBeforeUnmount(() => emit('ready', null));

function onWheel(event: WheelEvent) {
  event.preventDefault();
  emit('wheel', event);
}
</script>

<template>
  <div
    ref="element"
    @pointerdown="emit('pointerdown', $event)"
    @pointermove="emit('pointermove', $event)"
    @pointerup="emit('pointerup', $event)"
    @pointercancel="emit('pointercancel', $event)"
    @wheel="onWheel"
  >
    <slot />
  </div>
</template>
