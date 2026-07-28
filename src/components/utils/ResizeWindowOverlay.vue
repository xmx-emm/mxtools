<script setup lang="ts">

import {onMounted, onUnmounted, ref} from 'vue';
import {createRafScheduler} from '@/utils/raf.ts';

const isChangeWindowSize = ref(false);
let timeout: number | null = null;

function handleResize() {
  if (isChangeWindowSize.value) {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = window.setTimeout(() => {
      isChangeWindowSize.value = false;
      timeout = null;
    }, 200);
  } else {
    isChangeWindowSize.value = true;
  }
}

const resizeScheduler = createRafScheduler(handleResize);

onMounted(() => {
  window.addEventListener('resize', resizeScheduler.schedule, {passive: true});
});
onUnmounted(() => {
  window.removeEventListener('resize', resizeScheduler.schedule);
  resizeScheduler.cancel();
  if (timeout !== null) {
    clearTimeout(timeout);
  }
});
</script>

<template>
  <v-overlay v-model="isChangeWindowSize" class="glass-container"></v-overlay>
</template>
<style scoped>

</style>
