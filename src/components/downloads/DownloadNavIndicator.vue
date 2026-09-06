<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';
import {useDownloadsStore} from '@/stores/downloads.ts';
import {downloadIndicator} from '@/utils/download_indicator.ts';

const {t} = useI18n();
const downloads = useDownloadsStore();
const indicator = computed(() => downloadIndicator(downloads.jobs));
const label = computed(() => indicator.value.percent !== null
  ? t('downloads.navProgress', {percent: Math.round(indicator.value.percent)})
  : indicator.value.state === 'idle' ? t('downloads.emptyQueue') : t('downloads.navStates.' + indicator.value.state));
const icon = computed(() => ({paused: 'mdi-pause-circle', error: 'mdi-alert-circle'}[indicator.value.state] ?? 'mdi-download'));
</script>

<template>
  <span class="download-nav-indicator" role="status" :aria-label="label" :title="label" :data-state="indicator.state">
    <v-progress-circular v-if="indicator.state === 'active'" class="download-nav-ring"
      :model-value="indicator.percent ?? 0" :indeterminate="indicator.percent === null" size="28" width="2" color="primary"/>
    <v-icon :icon="icon" :size="indicator.state === 'active' ? 15 : 22"
      :color="indicator.state === 'error' ? 'error' : indicator.state === 'paused' ? 'warning' : undefined"/>
    <span v-if="indicator.state === 'queued'" class="download-nav-dot"/>
  </span>
</template>

<style scoped>
.download-nav-indicator { position: relative; display: inline-grid; place-items: center; width: 28px; height: 28px; flex: 0 0 28px; }
.download-nav-ring { position: absolute; inset: 0; }
.download-nav-dot { position: absolute; right: 0; top: 0; width: 6px; height: 6px; background: rgb(var(--v-theme-primary)); border-radius: 50%; }
</style>
