<script setup lang="ts">
import {ref, watch} from 'vue';
import {readGameExecutableIcon} from '@/ipc/commands.ts';

const props = defineProps<{paths: string[]}>();
const icon = ref<string | null>(null);
watch(() => JSON.stringify(props.paths), async (_, __, onCleanup) => {
  let stale = false;
  onCleanup(() => { stale = true; });
  icon.value = null;
  if (!(window as Window & {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__) return;
  for (const path of [...new Set(props.paths)]) {
    const result = await readGameExecutableIcon(path).catch(() => null);
    if (stale) return;
    if (result) { icon.value = result; return; }
  }
}, {immediate: true});
</script>

<template>
  <span class="local-game-icon" aria-hidden="true">
    <img v-if="icon" :src="icon" alt="" @error="icon = null">
    <v-icon v-else icon="mdi-gamepad-variant" size="22" />
  </span>
</template>

<style scoped>
.local-game-icon { display: inline-flex; flex: 0 0 32px; width: 32px; height: 32px; align-items: center; justify-content: center; color: rgba(var(--v-theme-on-surface), .45); }
.local-game-icon img { width: 32px; height: 32px; object-fit: contain; }
</style>
