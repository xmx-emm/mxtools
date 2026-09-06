<script setup lang="ts">
import {computed, ref} from 'vue';
import {useRouter} from 'vue-router';
import {useI18n} from 'vue-i18n';
import {useDownloadsStore, isFinishedDownload} from '@/stores/downloads.ts';
import DownloadJobList from './DownloadJobList.vue';

const emit = defineEmits<{close: []}>();
const router = useRouter();
const {t} = useI18n();
const downloads = useDownloadsStore();
const tab = ref('queue');
const queuedJobs = computed(() => downloads.jobs.filter(job => !isFinishedDownload(job.status)));
const finishedJobs = computed(() => downloads.jobs.filter(job => isFinishedDownload(job.status)));
const jobs = computed(() => tab.value === 'queue' ? queuedJobs.value : finishedJobs.value);
function openFullPage() {
  void router.push('/downloads').then(() => emit('close'));
}
</script>

<template>
  <section class="download-popover" role="dialog" :aria-label="t('downloads.title')" data-testid="download-queue-popover">
    <header class="download-popover-header">
      <v-tabs v-model="tab" color="primary" density="compact" height="var(--app-control-height-action)" :aria-label="t('downloads.filter')">
        <v-tab value="queue" variant="text">{{ t('downloads.queue') }} <span class="download-count">{{ queuedJobs.length }}</span></v-tab>
        <v-tab value="finished" variant="text">{{ t('downloads.history') }} <span class="download-count">{{ finishedJobs.length }}</span></v-tab>
      </v-tabs>
      <v-spacer/>
      <v-tooltip :text="t('downloads.openFullPage')" location="top">
        <template #activator="{props}">
          <v-btn v-bind="props" variant="text" icon="mdi-arrow-expand" size="small"
            :aria-label="t('downloads.openFullPage')" @click="openFullPage"/>
        </template>
      </v-tooltip>
      <v-tooltip :text="t('downloads.closePopover')" location="top">
        <template #activator="{props}">
          <v-btn v-bind="props" variant="text" icon="mdi-close" size="small"
            :aria-label="t('downloads.closePopover')" @click="emit('close')"/>
        </template>
      </v-tooltip>
    </header>
    <div class="download-popover-body">
      <p v-if="downloads.loading && !downloads.jobs.length" class="download-popover-empty" role="status">{{ t('downloads.phases.checking') }}</p>
      <v-alert v-else-if="downloads.error" type="error" variant="text" density="compact">{{ downloads.error }}</v-alert>
      <p v-else-if="!jobs.length" class="download-popover-empty">{{ t('downloads.emptyQueue') }}</p>
      <DownloadJobList v-else :jobs="jobs" compact/>
    </div>
  </section>
</template>

<style scoped>
.download-popover { display: flex; flex-direction: column; width: min(420px, calc(100vw - 32px)); max-width: 100%; height: min(440px, calc(100vh - 80px)); min-height: 0; overflow: hidden; color: rgb(var(--v-theme-on-surface)); background: rgb(var(--v-theme-surface)); border: 1px solid rgba(var(--v-theme-on-surface), .14); border-radius: 4px; box-shadow: 0 8px 24px rgba(0, 0, 0, .18); }
.download-popover-header { display: flex; align-items: center; gap: 4px; flex-shrink: 0; padding: 10px 12px; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .1); }
.download-popover-header :deep(.v-tab) { min-width: 0; padding: 0 8px; font-size: 13px; letter-spacing: 0; }
.download-popover-header :deep(.v-btn--icon) { width: var(--app-control-height-compact); height: var(--app-control-height-compact); border-radius: 4px; }
.download-count { display: inline-grid; min-width: 22px; height: 18px; margin-left: 6px; padding: 0 4px; place-items: center; color: rgba(var(--v-theme-on-surface), .65); background: rgba(var(--v-theme-on-surface), .08); border-radius: 4px; font-size: 11px; font-variant-numeric: tabular-nums; }
.download-popover-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.download-popover-empty { padding: 48px 16px; text-align: center; color: rgba(var(--v-theme-on-surface), .55); font-size: 13px; }
</style>
