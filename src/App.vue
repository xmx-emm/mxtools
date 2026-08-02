<script setup lang="ts">
import {useUiStyleStore} from '@/stores/style.ts';
import {nextTick, onBeforeUnmount, onMounted, watch} from 'vue';
import {useStateStore} from '@/stores/state.ts';
import {useSettingsStore} from '@/stores/settings.ts';

const ui = useUiStyleStore();
const settings = useSettingsStore();
let stopSystemThemeListener: (() => void) | undefined;

const SPLASH_MIN_MS = 600;

function dismissSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  el.classList.add('splash-hidden');
  if (settings.performanceMode) {
    el.remove();
    return;
  }
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}

watch(() => settings.performanceMode, (enabled) => {
  document.documentElement.toggleAttribute('data-mx-performance-mode', enabled);
}, {immediate: true});

onMounted(() => {
  stopSystemThemeListener = ui.watchSystemTheme();
  useStateStore().updateState();
  nextTick(() => {
    const elapsed = Date.now() - (window.__splashStart ?? 0);
    const remaining = Math.max(0, SPLASH_MIN_MS - elapsed);
    if (remaining > 0) {
      setTimeout(dismissSplash, remaining);
    } else {
      dismissSplash();
    }
  });
});

onBeforeUnmount(() => {
  stopSystemThemeListener?.();
});
</script>

<template>
  <v-app :theme="ui.themeStyle" class="not_select">
    <router-view class="not_scrollbar"/>
  </v-app>
</template>

<style scoped>
</style>
<style>

</style>
