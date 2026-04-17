<script setup lang="ts">
import {version} from '@/env.ts';
import {ref} from 'vue';
import {invoke} from '@tauri-apps/api/core';

// 上上下下左右左右baba
const OPEN_DEV_KEY = 'ArrowUpArrowUpArrowDownArrowDownArrowLeftArrowRightArrowLeftArrowRightbaba';

const timer = ref<any | null>(null);
const openToolKeys = ref('');

function showTool() {
  if (timer.value) {
    return;
  }
  window.onkeydown = (e) => {
    openToolKeys.value += e.key;
  };
  timer.value = setInterval(() => {
    if (openToolKeys.value.endsWith(OPEN_DEV_KEY)) {
      invoke('open_devtools');
      openToolKeys.value = '';
      clearTimeout(timer.value);
      timer.value = null;
      window.onkeydown = () => {
      };
    }
  }, 100);
}

</script>

<template>
  <div style="text-align: center" @click="showTool">{{ version }}</div>
</template>

<style scoped>

</style>
