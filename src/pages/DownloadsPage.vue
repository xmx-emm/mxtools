<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {isTauri} from '@tauri-apps/api/core';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {useDownloadsStore, isFinishedDownload} from '@/stores/downloads.ts';
import DownloadJobList from '@/components/downloads/DownloadJobList.vue';

const downloads = useDownloadsStore();
const {t, te} = useI18n();
const toast = useToast();
const filter = ref('all');
const busy = ref(false);
const jobs = computed(() => downloads.jobs.filter(job => filter.value === 'all'
  || (filter.value === 'active' ? !isFinishedDownload(job.status) : isFinishedDownload(job.status))));
const filters = computed(() => ['all', 'active', 'history'].map(value => ({value, title: t('downloads.' + value)})));
const terminalCount = computed(() => downloads.jobs.filter(job => isFinishedDownload(job.status)).length);

onMounted(() => { void downloads.initialize().catch(showError); });
function showError(error: unknown) { toast.error(error instanceof Error ? error.message : String(error)); }
function errorMessage(message: string) {
  const key = message.split(':')[0].trim();
  return te(key) ? t(key) : message;
}
async function clearHistory() {
  busy.value = true;
  try { await downloads.clearFinished(); }
  catch (error) { showError(error); }
  finally { busy.value = false; }
}
</script>

<template>
  <v-container class="downloads-page">
    <header class="downloads-header">
      <div>
        <h1>{{ t('downloads.title') }}</h1>
        <p class="text-medium-emphasis">{{ t('downloads.subtitle') }}</p>
      </div>
      <div class="downloads-actions">
        <v-btn variant="text" icon="mdi-refresh" :aria-label="t('downloads.refresh')" :title="t('downloads.refresh')" :loading="downloads.loading" :disabled="!isTauri()" @click="downloads.refresh()"/>
        <v-btn variant="tonal" :disabled="busy || !terminalCount" @click="clearHistory">
          {{ t('downloads.clearHistory') }}
        </v-btn>
      </div>
    </header>
    <v-alert v-if="!isTauri()" type="info" variant="tonal" class="mb-4">{{ t('downloads.desktopOnly') }}</v-alert>
    <v-alert v-if="downloads.error" type="error" variant="tonal" class="mb-4">{{ errorMessage(downloads.error) }}</v-alert>
    <div class="downloads-filter">
      <v-select v-model="filter" :items="filters" :label="t('downloads.filter')" hide-details density="compact" variant="outlined"/>
      <span class="text-medium-emphasis">{{ t('downloads.count', {count: downloads.unfinished}) }}</span>
    </div>
    <p class="downloads-note text-medium-emphasis">{{ t('downloads.sessionHint') }}</p>
    <v-card v-if="!jobs.length" variant="outlined" class="downloads-empty">{{ t('downloads.empty') }}</v-card>
    <DownloadJobList :jobs="jobs"/>
  </v-container>
</template>

<style scoped>
.downloads-page { max-width: 1100px; padding: 24px; }
.downloads-header, .downloads-filter { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.downloads-header { flex-wrap: wrap; margin-bottom: 24px; }
h1 { font-size: 24px; }
p { font-size: 12px; line-height: 1.7; }
.downloads-filter { justify-content: flex-start; }
.downloads-filter :deep(.v-input) { flex: 0 1 200px; }
.downloads-filter :deep(.v-field__input) { min-height: var(--app-control-height-field); }
.downloads-note { margin: 12px 0; }
.downloads-empty { padding: 48px 20px; text-align: center; }
@media (max-width: 600px) {
  .downloads-page { padding: 16px; }
}
.downloads-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; justify-content: flex-end; }
.downloads-actions :deep(.v-btn) { height: var(--app-control-height-compact); }
.downloads-actions :deep(.v-btn--icon) { width: var(--app-control-height-compact); }
</style>
