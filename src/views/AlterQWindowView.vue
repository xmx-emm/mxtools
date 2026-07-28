<script setup lang="ts">
import {onMounted} from 'vue';
import {useI18n} from 'vue-i18n';
import {getCurrentWindow} from '@tauri-apps/api/window';
import AppTopBar from '@/components/AppTopBar.vue';
import ApexAlterQDialog from '@/components/game/apex/alter_q/ApexAlterQDialog.vue';

const {t} = useI18n();

onMounted(() => {
  void getCurrentWindow().setDecorations(false).catch(() => {
    /* 权限或环境不支持时忽略 */
  });
});
</script>

<template>
  <div class="alter-q-window-root">
    <AppTopBar :title="t('apex.alterQ.title')" />
    <div class="alter-q-window-body">
      <ApexAlterQDialog />
    </div>
  </div>
</template>

<style scoped>
.alter-q-window-root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  height: 100%;
  background: rgb(var(--v-theme-surface));
  overflow: hidden;
  isolation: isolate;
}
.alter-q-window-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
</style>
