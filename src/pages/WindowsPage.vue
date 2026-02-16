<script setup lang="ts">
import {routeFullPath} from '../utils/router.ts';
import {useRoute} from 'vue-router';
import {computed, onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {invoke} from '@tauri-apps/api/core';

const {t} = useI18n();
const route = useRoute();
const systemInfo = ref([]);
const isLoading = ref(false);

const isWindows = computed(() => routeFullPath(route) === '/tools/windows');
const showData = computed(() => {
  const res: { [name: string]: string }[] = [];
  Object.entries(systemInfo.value).forEach(([key, value]) => {
    res.push({name: key, value: value});
  });
  return res;
});
const headers = computed(() => [
  {title: t('common.name'), key: 'name'},
  {title: t('common.value'), key: 'value'},
] as { title: string; key: string }[]);


onMounted(async () => {
  isLoading.value = true;
  systemInfo.value = await invoke('system_info');
  isLoading.value = false;
});
</script>

<template>
  <div v-if="isWindows" class="page-content">
    <h2 class="text-h6 font-weight-medium mb-3" style="letter-spacing: -0.02em;">{{ t('windows.title') }}</h2>
    <v-card variant="flat" class="windows-card">
      <v-data-table-virtual
          :items="showData"
          :loading="isLoading"
          :headers="headers"
          hide-default-footer
          :item-height="40"
          hide-default-header
          class="elevation-0"
      />
    </v-card>
  </div>
  <router-view v-else/>
</template>

<style scoped>
.windows-card {
  border: 1px solid rgba(var(--v-border-color), 0.08);
  border-radius: 12px;
  overflow: hidden;
}
</style>
