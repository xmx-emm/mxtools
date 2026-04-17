<script setup lang="ts">

import {onMounted, onUnmounted, ref} from 'vue';

const isChangeWindowSize = ref(false);
let timeout: number | null = null;

function handleResize() {
  console.log('handleResize');
  if (isChangeWindowSize.value) {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = window.setTimeout(() => {
      isChangeWindowSize.value = false;
    }, 200);
  } else {
    isChangeWindowSize.value = true;
  }
}

onMounted(() => {
  window.addEventListener('resize', handleResize);
});
onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});
</script>

<template>
  {{ isChangeWindowSize }}
  <v-overlay v-model="isChangeWindowSize" class="glass-container"></v-overlay>
</template>
<style scoped>

</style>
