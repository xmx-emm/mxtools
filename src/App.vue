<script setup lang="ts">
import {uiStyleStore} from '@/stores/style.ts';
import {nextTick, onMounted} from 'vue';
import {useStateStore} from '@/stores/state.ts';
import {DisableRightClick} from '@/utils/event.ts';

const ui = uiStyleStore();

const SPLASH_MIN_MS = 600;

function dismissSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  el.classList.add('splash-hidden');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}

onMounted(() => {
  useStateStore().updateState();
  nextTick(() => {
    const elapsed = Date.now() - ((window as any).__splashStart || 0);
    const remaining = Math.max(0, SPLASH_MIN_MS - elapsed);
    if (remaining > 0) {
      setTimeout(dismissSplash, remaining);
    } else {
      dismissSplash();
    }
  });
});
DisableRightClick();
</script>

<template>
  <v-app :theme="ui.themeStyle" class="not_select">
    <router-view class="not_scrollbar not_select"/>
  </v-app>
</template>

<style scoped>
</style>
<style>

</style>
