<script setup lang="ts">
import {routeFullPath} from '../utils/router.ts';
import {useRoute} from 'vue-router';
import {computed, onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {invoke} from '@tauri-apps/api/core';
import {writeText} from '@tauri-apps/plugin-clipboard-manager';
import {useToast} from 'vue-toastification';

const { t } = useI18n();
const toast = useToast();
const route = useRoute();
const systemInfo = ref<[string, string][]>([]);
const isLoading = ref(false);

const isWindows = computed(() => routeFullPath(route) === '/tools/windows');
const showData = computed(() => {
  return systemInfo.value.map(([key, value]) => ({
    name: t(`windows.sysInfo.${key}`, key),
    value,
  }));
});
const headers = computed(() => [
  { title: t('common.name'), key: 'name', sortable: false },
  { title: t('common.value'), key: 'value', sortable: false },
] as { title: string; key: string; sortable: boolean }[]);

function copySysInfoText(): string {
  return showData.value.map(({ name, value }) => `${name}: ${value}`).join('\n');
}

async function copySysInfo() {
  try {
    await writeText(copySysInfoText());
    toast.success(t('toast.copiedToClipboard'));
  } catch (e) {
    toast.error(t('toast.copyError'));
  }
}

onMounted(async () => {
  isLoading.value = true;
  systemInfo.value = await invoke('system_info');
  isLoading.value = false;
});
</script>

<template>
  <div v-if="isWindows" class="page-content">
    <div class="d-flex align-center mb-3 gap-2">
      <h2 class="text-h6 font-weight-medium" style="letter-spacing: -0.02em;">{{ t('windows.title') }}</h2>
      <v-spacer/>
      <v-btn
        v-if="!isLoading && showData.length"
        size="small"
        variant="tonal"
        prepend-icon="mdi-content-copy"
        @click="copySysInfo"
      >
        {{ t('windows.copySysInfo') }}
      </v-btn>
    </div>
    <v-card variant="flat" class="windows-card">
      <div v-if="isLoading" class="pa-4">
        <v-skeleton-loader
          v-for="index in 8"
          :key="index"
          type="text"
          class="mb-2"
        />
      </div>
      <v-data-table-virtual
        v-else
        :items="showData"
        :headers="headers"
        hide-default-footer
        density="compact"
        class="elevation-0 system-info-table"
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

:deep(.system-info-table) {
  font-size: 0.82rem;
}

:deep(.system-info-table thead th) {
  font-size: 0.78rem !important;
  font-weight: 600 !important;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.55) !important;
}

:deep(.system-info-table tbody td:first-child) {
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.8);
}

:deep(.system-info-table tbody td:last-child) {
  color: rgba(var(--v-theme-on-surface), 0.6);
}

:deep(.system-info-table tbody tr:hover) {
  background: rgba(var(--v-theme-on-surface), 0.03) !important;
}
</style>
