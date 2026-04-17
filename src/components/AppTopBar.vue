<script setup lang="ts">

import {WebviewWindow} from '@tauri-apps/api/webviewWindow';
import {TauriEvent} from '@tauri-apps/api/event';
import {computed, onMounted, onUnmounted, ref} from 'vue';
import {useStateStore} from '@/stores/state.ts';

const is_maximized = ref(false);
const state = useStateStore();

async function update_window_state() {
  try {
    is_maximized.value = await WebviewWindow.getCurrent().isMaximized();
  } catch (e) {
    console.log(e);
  }
}

function close_window() {
  const window = WebviewWindow.getCurrent();
  window.close();
}

function minimize_window() {
  const window = WebviewWindow.getCurrent();
  window.minimize();
  update_window_state();
}

async function switch_window() {
  const window = WebviewWindow.getCurrent();
  await window.toggleMaximize();
  await update_window_state();
}


const icon = computed(() => {
  return is_maximized.value ? 'mdi-window-restore' : 'mdi-window-maximize';
});

let unlistenResize: (() => void) | null = null;

onMounted(async () => {
  update_window_state();
  unlistenResize = await WebviewWindow.getCurrent().listen(TauriEvent.WINDOW_RESIZED, () => {
    update_window_state();
  });
});

onUnmounted(() => {
  unlistenResize?.();
});
</script>

<template>
  <v-system-bar window data-tauri-drag-region="true" class="app-title-bar">
    <span class="title-bar-drag flex-grow-1" data-tauri-drag-region="true"></span>
    <v-icon
      v-if="state.is_elevated"
      icon="mdi-security"
      class="title-bar-btn"
      title="Administrator"
    />
    <v-icon icon="mdi-window-minimize" class="title-bar-btn" @click="minimize_window"/>
    <v-icon :icon="icon" class="title-bar-btn ms-1" @click="switch_window"/>
    <v-icon icon="mdi-window-close" class="title-bar-btn title-bar-btn-close ms-1" @click="close_window"/>
  </v-system-bar>
</template>

<style scoped>
.app-title-bar {
  height: 32px;
  padding: 0 8px;
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), 0.08);
}

.title-bar-drag {
  -webkit-app-region: drag;
  app-region: drag;
}

.title-bar-btn {
  opacity: 0.8;
  border-radius: 6px;
  padding: 4px;
}

.title-bar-btn:hover {
  opacity: 1;
  background: rgba(128, 128, 128, 0.15);
}

.title-bar-btn.title-bar-btn-close {
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    opacity 0.2s ease;
}

.title-bar-btn.title-bar-btn-close:hover {
  background-color: rgb(232, 17, 35);
  color: rgb(255, 255, 255);
}
</style>
