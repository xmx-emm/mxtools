<script setup lang="ts">
/**
 * Steam：一键下载语音包（后台静默驱动本机 Steam 客户端控制台 download_depot）
 * 进度经 apex-miles-download-progress 事件推送；半自动流程保留为回退。
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
  ['checking', 'restartingSteam', 'waitingSteam', 'downloading', 'applying'].includes(phase.value),
);

const downloaded_mb = computed(() =>
  progress.value ? (progress.value.downloadedBytes / 1048576).toFixed(0) : '0',
);
const total_mb = computed(() =>
  progress.value ? (progress.value.totalBytes / 1048576).toFixed(0) : '0',
);

const phase_text = computed(() => {
  switch (phase.value) {
    case 'checking': return t('apex.milesDownload.autoChecking');
    case 'restartingSteam': return t('apex.milesDownload.autoRestarting');
    case 'waitingSteam': return t('apex.milesDownload.autoWaiting');
    case 'downloading': return t('apex.milesDownload.autoDownloading');
    case 'applying': return t('apex.milesDownload.autoApplying');
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
  apex_store.start_miles_auto_download().catch((e) => {
    toast.error(String(e));
  });
}

function confirm_cancel(stop_steam: boolean) {
  show_cancel_confirm.value = false;
  apex_store.cancel_miles_auto_download(stop_steam).catch((e) => {
    toast.error(String(e));
  });
}

function open_semi_automatic() {
  apex_store.download_miles_language_auto_dialog = false;
  apex_store.download_miles_language_semi_automatic_dialog = true;
}

function open_audio_folder() {
  openApexAudioFolderPath({platform: 'steam', eaUserId: null}).catch((e) => {
    toast.error(String(e));
  });
}
</script>

<template>
  <v-dialog
    class="not_select"
    v-model="apex_store.download_miles_language_auto_dialog"
    max-width="560"
  >
    <v-card :title="t('apex.milesDownload.autoTitle')">
      <v-card-text>
        <!-- 初始介绍 -->
        <template v-if="phase === 'intro'">
          <p>{{ t('apex.milesDownload.autoIntro') }}</p>
          <p class="text-medium-emphasis mt-2">{{ t('apex.milesDownload.autoIntroRestart') }}</p>
          <p class="mt-2">
            <span class="text-medium-emphasis">depot: </span>
            <code>{{ apex_store.language_depot ?? '-' }}</code>
            <span class="text-medium-emphasis"> · {{ apex_store.language }}</span>
          </p>
        </template>

        <!-- 进行中的非下载阶段 -->
        <template v-else-if="['checking', 'restartingSteam', 'waitingSteam', 'applying'].includes(phase)">
          <div class="d-flex align-center">
            <v-progress-circular indeterminate size="22" width="3" class="mr-3"/>
            <span>{{ phase_text }}</span>
          </div>
        </template>

        <!-- 下载中 -->
        <template v-else-if="phase === 'downloading'">
          <div class="mb-2">{{ phase_text }}</div>
          <v-progress-linear
            :model-value="progress?.percent ?? 0"
            color="primary"
            height="10"
            rounded
          />
          <div class="d-flex justify-space-between mt-1 text-medium-emphasis">
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
            <span>{{ t('apex.milesDownload.autoDone') }}</span>
          </div>
          <p class="text-medium-emphasis mt-2">{{ t('apex.milesDownload.autoDoneHint') }}</p>
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
          <p class="text-medium-emphasis mb-2" style="font-size: 12px">
            {{ t('apex.milesDownload.autoCancelHint') }}
          </p>
          <div class="d-flex flex-column" style="gap: 6px">
            <v-btn size="small" variant="tonal" @click="confirm_cancel(false)">
              {{ t('apex.milesDownload.autoCancelKeepFiles') }}
            </v-btn>
            <v-btn size="small" variant="tonal" color="error" @click="confirm_cancel(true)">
              {{ t('apex.milesDownload.autoCancelStopSteam') }}
            </v-btn>
            <v-btn size="small" variant="text" @click="show_cancel_confirm = false">
              {{ t('apex.milesDownload.autoCancelBack') }}
            </v-btn>
          </div>
        </template>
      </v-card-text>

      <template v-slot:actions>
        <v-btn
          v-if="phase === 'intro'"
          variant="text"
          @click="open_semi_automatic"
        >{{ t('apex.milesDownload.autoSemiAutoFallback') }}
        </v-btn>
        <v-spacer/>
        <template v-if="phase === 'intro'">
          <v-btn @click="apex_store.download_miles_language_auto_dialog = false">
            {{ t('apex.milesDownload.close') }}
          </v-btn>
          <v-btn color="primary" variant="tonal" @click="start" :disabled="!apex_store.language_depot">
            {{ t('apex.milesDownload.autoStartBtn') }}
          </v-btn>
        </template>
        <template v-else-if="is_running">
          <v-btn @click="apex_store.download_miles_language_auto_dialog = false">
            {{ t('apex.milesDownload.close') }}
          </v-btn>
          <v-btn color="error" variant="tonal" @click="show_cancel_confirm = true">
            {{ t('apex.milesDownload.autoCancel') }}
          </v-btn>
        </template>
        <template v-else-if="phase === 'done'">
          <v-btn @click="open_audio_folder">{{ t('apex.milesDownload.autoOpenAudioFolder') }}</v-btn>
          <v-btn color="primary" variant="tonal" @click="apex_store.download_miles_language_auto_dialog = false">
            {{ t('apex.milesDownload.close') }}
          </v-btn>
        </template>
        <template v-else>
          <v-btn @click="apex_store.download_miles_language_auto_dialog = false">
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
