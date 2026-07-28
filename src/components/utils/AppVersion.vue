<script setup lang="ts">
import {version} from '@/env.ts';
import {onUnmounted, ref} from 'vue';
import {openDevtools} from '@/ipc/commands.ts';

/**
 * INTENTIONAL: Release builds keep DevTools reachable for field debugging.
 * Backend: `open_devtools` + Cargo `devtools` feature (see src-tauri).
 * Do NOT remove this entry or gate it to debug-only without product owner approval.
 */
// 上上下下左右左右baba
const OPEN_DEV_KEY = 'ArrowUpArrowUpArrowDownArrowDownArrowLeftArrowRightArrowLeftArrowRightbaba';

const listening = ref(false);
let openToolKeys = '';
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function clearIdleTimer() {
  if (idleTimer == null) return;
  clearTimeout(idleTimer);
  idleTimer = null;
}

function stopListening() {
  if (!listening.value) return;
  listening.value = false;
  clearIdleTimer();
  openToolKeys = '';
  window.removeEventListener('keydown', onKeyDown);
}

function onKeyDown(e: KeyboardEvent) {
  openToolKeys += e.key;
  if (openToolKeys.length > OPEN_DEV_KEY.length) {
    openToolKeys = openToolKeys.slice(-OPEN_DEV_KEY.length);
  }
  if (openToolKeys === OPEN_DEV_KEY) {
    void openDevtools();
    stopListening();
    return;
  }
  // 一段时间无输入则退出监听，避免长期占用 keydown
  clearIdleTimer();
  idleTimer = setTimeout(stopListening, 4000);
}

function showTool() {
  if (listening.value) return;
  listening.value = true;
  openToolKeys = '';
  window.addEventListener('keydown', onKeyDown);
  idleTimer = setTimeout(stopListening, 4000);
}

onUnmounted(() => {
  stopListening();
});
</script>

<template>
  <div style="text-align: center" @click="showTool">{{ version }}</div>
</template>

<style scoped>

</style>
