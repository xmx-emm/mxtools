<script setup lang="ts">
import {computed, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {useDownloadsStore, isFinishedDownload} from '@/stores/downloads.ts';
import {openApexAudioFolderPath, type DownloadJob} from '@/ipc/commands.ts';

withDefaults(defineProps<{jobs: DownloadJob[]; compact?: boolean}>(), {compact: false});
const downloads = useDownloadsStore();
const {t, te} = useI18n();
const toast = useToast();
const busy = ref(false);
const pending = ref<{job: DownloadJob; action: 'pause' | 'cancel'} | null>(null);
const confirmOpen = computed({get: () => pending.value !== null, set: value => { if (!value) pending.value = null; }});
function showError(error: unknown) { toast.error(error instanceof Error ? error.message : String(error)); }
function phase(job: DownloadJob) {
  const key = 'downloads.phases.' + job.status;
  return te(key) ? t(key) : job.status;
}
function language(job: DownloadJob) {
  const key = 'apexLaunchOptions.milesLanguage.' + job.language;
  return te(key) ? t(key) : job.language;
}
function size(bytes: number) { return (bytes / 1048576).toFixed(1) + ' MB'; }
function errorMessage(message: string) {
  const key = message.split(':')[0].trim();
  return te(key) ? t(key) : message;
}
function canStop(job: DownloadJob) {
  return !isFinishedDownload(job.status) && !['applying', 'restoringLanguage', 'stopping'].includes(job.status);
}
async function control(job: DownloadJob, action: 'pause' | 'cancel' | 'resume' | 'retry') {
  if (busy.value) return;
  if ((action === 'pause' || action === 'cancel') && !['queued', 'paused'].includes(job.status)) {
    pending.value = {job, action};
    return;
  }
  await perform(job.id, action);
}
async function perform(id: number, action: 'pause' | 'cancel' | 'resume' | 'retry') {
  busy.value = true;
  try { await downloads.control(id, action); }
  catch (error) { showError(error); }
  finally { busy.value = false; }
}
async function confirmStop() {
  const request = pending.value;
  if (!request) return;
  pending.value = null;
  await perform(request.job.id, request.action);
}
function openFolder(job: DownloadJob) {
  void openApexAudioFolderPath({platform: job.platform, eaUserId: job.eaUserId ?? null}).catch(showError);
}

</script>

<template>
  <div class="download-job-list">
    <article v-for="job in jobs" :key="job.id" class="download-job" :class="{'download-job--compact': compact}">
      <div class="download-job-heading">
        <div>
          <h2>Apex · {{ job.platform === 'steam' ? 'Steam' : 'EA' }} · {{ language(job) }}</h2>
          <p v-if="job.platform === 'ea' && job.progress.sourcePlatform === 'steam'" class="text-medium-emphasis">{{ t('downloads.steamToEa') }}</p>
          <p v-if="!compact" class="text-medium-emphasis">{{ t('downloads.created') }} {{ new Date(job.createdAt).toLocaleString() }}</p>
        </div>
        <v-chip size="small" variant="tonal">{{ phase(job) }}</v-chip>
      </div>
      <v-progress-linear
        v-if="!['queued', 'error', 'cancelled'].includes(job.status)"
        :model-value="job.progress.percent"
        :indeterminate="!job.progress.progressKnown && !['paused', 'done'].includes(job.status)"
        color="primary" height="6" class="my-3"
      />
      <p v-if="job.progress.progressKnown" class="download-metrics">
        {{ job.progress.percent.toFixed(1) }}%
        <span v-if="job.progress.totalChunks"> · {{ t('downloads.chunkProgress', {done: job.progress.downloadedChunks, total: job.progress.totalChunks}) }}</span>
        <span v-if="job.progress.totalBytes"> · {{ size(job.progress.downloadedBytes) }} / {{ size(job.progress.totalBytes) }}</span>
      </p>
      <p v-else-if="!compact && job.status === 'downloading'" class="text-medium-emphasis">{{ t('downloads.indeterminateHint') }}</p>
      <p v-if="job.status === 'error'" class="text-error">{{ errorMessage(job.progress.message) }}</p>
      <div class="downloads-actions">
        <v-btn v-if="canStop(job) && job.status !== 'paused'" variant="text" icon="mdi-pause-circle" :aria-label="t('downloads.pause')" :title="t('downloads.pause')" :disabled="busy" @click="control(job, 'pause')"/>
        <v-btn v-if="job.status === 'paused'" variant="tonal" icon="mdi-play" :aria-label="t('downloads.resume')" :title="t('downloads.resume')" :disabled="busy" @click="control(job, 'resume')"/>
        <v-btn v-if="canStop(job)" variant="text" color="error" icon="mdi-close" :aria-label="t('downloads.cancel')" :title="t('downloads.cancel')" :disabled="busy" @click="control(job, 'cancel')"/>
        <v-btn v-if="['error', 'cancelled'].includes(job.status)" variant="tonal" icon="mdi-refresh" :aria-label="t('downloads.retry')" :title="t('downloads.retry')" :disabled="busy" @click="control(job, 'retry')"/>
        <v-btn v-if="job.status === 'done'" variant="text" prepend-icon="mdi-folder-open-outline" @click="openFolder(job)">{{ t('downloads.openFolder') }}</v-btn>
      </div>
      <p v-if="!compact && job.status === 'done'" class="downloads-note text-medium-emphasis">{{ t('downloads.historyHint') }}</p>
    </article>
    <v-dialog v-model="confirmOpen" max-width="520">
      <v-card :title="t('downloads.confirmTitle')">
        <v-card-text>{{ t(pending?.job.progress.sourcePlatform === 'steam' ? 'downloads.steamStopHint' : 'downloads.stopHint') }}</v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn variant="text" @click="pending = null">{{ t('downloads.back') }}</v-btn>
          <v-btn color="primary" variant="tonal" @click="confirmStop">{{ t('downloads.confirmStop') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.download-job { padding: 18px; margin: 14px 0; border: 1px solid rgba(var(--v-theme-on-surface), .18); border-radius: 4px; overflow-wrap: anywhere; }
.download-job-heading { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; }
.download-job-heading > div { min-width: 0; flex: 1 1 180px; }
.download-job-heading :deep(.v-chip) { flex-shrink: 0; max-width: 100%; }
h2 { font-size: 15px; line-height: 1.5; }
p { font-size: 12px; line-height: 1.7; }
.downloads-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; justify-content: flex-end; }
.downloads-actions :deep(.v-btn) { height: var(--app-control-height-compact); }
.downloads-actions :deep(.v-btn--icon) { width: var(--app-control-height-compact); }
.downloads-note { margin: 12px 0; }
.download-metrics { font-variant-numeric: tabular-nums; }
.download-job--compact { padding: 12px 16px; margin: 0; border: 0; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .1); border-radius: 0; }
.download-job--compact h2 { font-size: 13px; }
.download-job--compact .downloads-actions { gap: 4px; margin-top: 6px; }
.download-job--compact:last-child { border-bottom: 0; }
</style>
