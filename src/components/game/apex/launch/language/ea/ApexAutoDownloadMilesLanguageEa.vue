<script setup lang="ts">
/**
 * EA：一键下载语音包（驱动 EA App 原生桥切换游戏语言触发增量下载，完成后切回）
 * 进度经 apex-miles-download-progress 事件推送；手动流程保留为回退。
 */
import {computed, onMounted, onUnmounted, ref} from 'vue';
import {listen} from '@tauri-apps/api/event';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {useApexStore} from '@/stores/game/apex.ts';
import {
  APEX_MILES_DOWNLOAD_EVENT,
  openApexAudioFolderPath,
  type ApexMilesDownloadProgress,
} from '@/ipc/commands.ts';

const {t, te} = useI18n();
const apex_store = useApexStore();
const toast = useToast();

const show_cancel_confirm = ref(false);
let unlisten: (() => void) | null = null;

onMounted(async () => {
  unlisten = await listen<ApexMilesDownloadProgress>(APEX_MILES_DOWNLOAD_EVENT, (event) => {
    apex_store.handle_miles_download_event(event.payload);
  });
});

onUnmounted(() => {
  unlisten?.();
  unlisten = null;
});

const progress = computed(() => apex_store.miles_download_progress);
const phase = computed(() => progress.value?.phase ?? 'intro');
const is_running = computed(() =>
  [
    'checking',
    'restartingEa',
    'waitingEa',
    'switchingLanguage',
    'downloading',
    'restoringLanguage',
  ].includes(phase.value),
);

const downloaded_mb = computed(() =>
  progress.value ? (progress.value.downloadedBytes / 1048576).toFixed(0) : '0',
);
const total_mb = computed(() =>
  progress.value ? (progress.value.totalBytes / 1048576).toFixed(0) : '0',
);
const has_bytes = computed(() => (progress.value?.totalBytes ?? 0) > 0);

const phase_text = computed(() => {
  switch (phase.value) {
    case 'checking': return t('apex.milesDownload.autoEaChecking');
    case 'restartingEa': return t('apex.milesDownload.autoEaRestarting');
    case 'waitingEa': return t('apex.milesDownload.autoEaWaiting');
    case 'switchingLanguage': return t('apex.milesDownload.autoEaSwitching');
    case 'downloading': return t('apex.milesDownload.autoEaDownloading');
    case 'restoringLanguage': return t('apex.milesDownload.autoEaRestoring');
    default: return '';
  }
});

function error_text(message: string): string {
  if (!message) return '';
  const key = message.split(':')[0].trim();
  return te(key) ? t(key) : message;
}

function start() {
  show_cancel_confirm.value = false;
  apex_store.start_miles_auto_download_ea().catch((e) => {
    toast.error(String(e));
  });
}

function confirm_cancel(stop_ea: boolean) {
  show_cancel_confirm.value = false;
  apex_store.cancel_miles_auto_download_ea(stop_ea).catch((e) => {
    toast.error(String(e));
  });
}

function open_manual() {
  apex_store.download_miles_language_auto_dialog_ea = false;
  apex_store.download_miles_language_manual_dialog_ea = true;
}

function open_audio_folder() {
  const acc = apex_store.active_apex_account;
  openApexAudioFolderPath({
    platform: 'ea',
    eaUserId: acc?.kind === 'ea' ? acc.user.id : null,
  }).catch((e) => {
    toast.error(String(e));
  });
}
</script>

<template>
  <v-dialog
    class="not_select"
    v-model="apex_store.download_miles_language_auto_dialog_ea"
    max-width="560"
  >
    <v-card :title="t('apex.milesDownload.autoEaTitle')">
      <v-card-text>
        <!-- 初始介绍 -->
        <template v-if="phase === 'intro'">
          <p>{{ t('apex.milesDownload.autoEaIntro') }}</p>
          <p class="text-medium-emphasis mt-2">{{ t('apex.milesDownload.autoEaIntroSwitch') }}</p>
          <p class="mt-2">
            <span class="text-medium-emphasis">{{ t('apex.milesDownload.autoEaTarget') }}: </span>
            <code>{{ apex_store.language }}</code>
          </p>
        </template>

        <!-- 进行中的非下载阶段 -->
        <template v-else-if="['checking', 'restartingEa', 'waitingEa', 'switchingLanguage', 'restoringLanguage'].includes(phase)">
          <div class="d-flex align-center">
            <v-progress-circular indeterminate size="22" width="3" class="mr-3"/>
            <span>{{ phase_text }}</span>
          </div>
        </template>

        <!-- 下载中 -->
        <template v-else-if="phase === 'downloading'">
          <div class="mb-2">{{ phase_text }}</div>
          <v-progress-linear
            :model-value="has_bytes ? (progress?.percent ?? 0) : undefined"
            :indeterminate="!has_bytes"
            color="primary"
            height="10"
            rounded
          />
          <div v-if="has_bytes" class="d-flex justify-space-between mt-1 text-medium-emphasis">
            <span>{{ downloaded_mb }} / {{ total_mb }} MB</span>
            <span>{{ (progress?.percent ?? 0).toFixed(1) }}%</span>
          </div>
          <p class="text-medium-emphasis mt-2" style="font-size: 12px">
            {{ t('apex.milesDownload.autoMinimizeHint') }}
          </p>
        </template>

        <!-- 完成 -->
        <template v-else-if="phase === 'done'">
          <div class="d-flex align-center">
            <v-icon icon="mdi-check-circle" color="success" class="mr-2"/>
            <span>{{ t('apex.milesDownload.autoEaDone') }}</span>
          </div>
          <p class="text-medium-emphasis mt-2">{{ t('apex.milesDownload.autoEaDoneHint') }}</p>
        </template>

        <!-- 失败 -->
        <template v-else-if="phase === 'error'">
          <div class="d-flex align-center error_color">
            <v-icon icon="mdi-alert-circle" color="error" class="mr-2"/>
            <span>{{ t('apex.milesDownload.autoError') }}</span>
          </div>
          <p class="error_color mt-2">{{ error_text(progress?.message ?? '') }}</p>
        </template>

        <!-- 已取消 -->
        <template v-else-if="phase === 'cancelled'">
          <div class="d-flex align-center">
            <v-icon icon="mdi-pause-circle" color="warning" class="mr-2"/>
            <span>{{ t('apex.milesDownload.autoCancelled') }}</span>
          </div>
        </template>

        <!-- 取消确认 -->
        <template v-if="show_cancel_confirm">
          <v-divider class="my-3"/>
          <p class="mb-2 font-weight-medium">{{ t('apex.milesDownload.autoCancelTitle') }}</p>
          <div class="d-flex flex-column" style="gap: 6px">
            <v-btn size="small" variant="tonal" @click="confirm_cancel(false)">
              {{ t('apex.milesDownload.autoEaCancelKeepFiles') }}
            </v-btn>
            <v-btn size="small" variant="tonal" color="error" @click="confirm_cancel(true)">
              {{ t('apex.milesDownload.autoEaCancelStopEa') }}
            </v-btn>
            <v-btn size="small" variant="text" @click="show_cancel_confirm = false">
              {{ t('apex.milesDownload.autoCancelBack') }}
            </v-btn>
          </div>
        </template>
      </v-card-text>

      <template v-slot:actions>
        <v-btn
          v-if="phase === 'intro' || phase === 'error'"
          variant="text"
          @click="open_manual"
        >{{ t('apex.milesDownload.autoEaManualFallback') }}
        </v-btn>
        <v-spacer/>
        <template v-if="phase === 'intro'">
          <v-btn @click="apex_store.download_miles_language_auto_dialog_ea = false">
            {{ t('apex.milesDownload.close') }}
          </v-btn>
          <v-btn color="primary" variant="tonal" @click="start">
            {{ t('apex.milesDownload.autoStartBtn') }}
          </v-btn>
        </template>
        <template v-else-if="is_running">
          <v-btn @click="apex_store.download_miles_language_auto_dialog_ea = false">
            {{ t('apex.milesDownload.close') }}
          </v-btn>
          <v-btn color="error" variant="tonal" @click="show_cancel_confirm = true">
            {{ t('apex.milesDownload.autoCancel') }}
          </v-btn>
        </template>
        <template v-else-if="phase === 'done'">
          <v-btn @click="open_audio_folder">{{ t('apex.milesDownload.autoOpenAudioFolder') }}</v-btn>
          <v-btn color="primary" variant="tonal" @click="apex_store.download_miles_language_auto_dialog_ea = false">
            {{ t('apex.milesDownload.close') }}
          </v-btn>
        </template>
        <template v-else>
          <v-btn @click="apex_store.download_miles_language_auto_dialog_ea = false">
            {{ t('apex.milesDownload.close') }}
          </v-btn>
          <v-btn color="primary" variant="tonal" @click="start">
            {{ t('apex.milesDownload.autoRetry') }}
          </v-btn>
        </template>
      </template>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.error_color {
  color: rgb(var(--v-theme-error));
}
</style>
