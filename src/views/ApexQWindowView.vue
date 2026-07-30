<script setup lang="ts">
import {onMounted} from 'vue';
import {useI18n} from 'vue-i18n';
import {getCurrentWindow} from '@tauri-apps/api/window';
import AppTopBar from '@/components/AppTopBar.vue';
import ApexQDialog from '@/components/game/apex/apex_q/ApexQDialog.vue';

const {t} = useI18n();

onMounted(() => {
  void getCurrentWindow().setDecorations(false).catch(() => {
    /* 权限或环境不支持时忽略 */
  });
});
</script>

<template>
  <v-main class="apex-q-window-root">
    <AppTopBar :title="t('apex.apexQ.title')" />
    <div class="apex-q-window-body">
      <ApexQDialog />
    </div>
  </v-main>
</template>

<style scoped>
.apex-q-window-root {
  display: flex;
  flex-flow: column;
  height: 100vh;
  background: rgb(var(--v-theme-surface));
  overflow: hidden;
}
.apex-q-window-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
</style>
