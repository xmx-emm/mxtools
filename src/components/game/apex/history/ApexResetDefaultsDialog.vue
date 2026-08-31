<script setup lang="ts">
import {computed, onUnmounted, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {useApexStore} from '@/stores/game/apex.ts';
import {
  apexIsRunning,
  eaDesktopIsRunningByTasklist,
  steamIsRunningByTasklist,
  thoroughlyKillEaDesktop,
  thoroughlyKillSteam,
} from '@/ipc/commands.ts';

const apexStore = useApexStore();
const {t} = useI18n();
const toast = useToast();
const checking = ref(false);
const processStatusReady = ref(false);
const checkFailed = ref(false);
const launcherRunning = ref(false);
const forceClosingLauncher = ref(false);
const runningProcesses = ref<string[]>([]);
const PROCESS_REFRESH_MS = 1500;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshGeneration = 0;

function stopProcessRefresh(clearState = true) {
  refreshGeneration += 1;
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  checking.value = false;
  if (clearState) {
    processStatusReady.value = false;
    checkFailed.value = false;
    launcherRunning.value = false;
    runningProcesses.value = [];
  }
}

async function checkProcesses(expectedGeneration: number) {
  const account = apexStore.active_apex_account;
  if (!account) {
    if (refreshGeneration === expectedGeneration) {
      processStatusReady.value = false;
      checkFailed.value = false;
      launcherRunning.value = false;
      runningProcesses.value = [];
    }
    return;
  }
  checking.value = true;
  try {
    const [gameRunning, launcherRunningResult] = await Promise.all([
      apexIsRunning(),
      account.kind === 'steam'
        ? steamIsRunningByTasklist()
        : eaDesktopIsRunningByTasklist(),
    ]);
    if (refreshGeneration !== expectedGeneration || !apexStore.reset_defaults_dialog) return;
    processStatusReady.value = true;
    checkFailed.value = false;
    launcherRunning.value = launcherRunningResult;
    runningProcesses.value = [
      ...(gameRunning ? ['Apex Legends'] : []),
      ...(launcherRunningResult ? [account.kind === 'steam' ? 'Steam' : 'EA Desktop'] : []),
    ];
  } catch (error) {
    if (refreshGeneration === expectedGeneration && apexStore.reset_defaults_dialog) {
      console.warn('check Apex reset processes failed', error);
      checkFailed.value = true;
    }
  } finally {
    if (refreshGeneration === expectedGeneration) {
      checking.value = false;
    }
  }
}

function scheduleProcessRefresh(expectedGeneration: number) {
  if (refreshGeneration !== expectedGeneration || !apexStore.reset_defaults_dialog) return;
  refreshTimer = setTimeout(async () => {
    refreshTimer = null;
    await checkProcesses(expectedGeneration);
    scheduleProcessRefresh(expectedGeneration);
  }, PROCESS_REFRESH_MS);
}

function startProcessRefresh(clearState = false) {
  stopProcessRefresh(clearState);
  const expectedGeneration = refreshGeneration;
  void checkProcesses(expectedGeneration).finally(() => {
    scheduleProcessRefresh(expectedGeneration);
  });
}

const launcherName = computed(() => (
  apexStore.active_apex_account?.kind === 'ea' ? 'EA Desktop' : 'Steam'
));

async function forceCloseLauncher() {
  const account = apexStore.active_apex_account;
  if (!account || forceClosingLauncher.value) return;
  forceClosingLauncher.value = true;
  stopProcessRefresh(false);
  try {
    if (account.kind === 'steam') await thoroughlyKillSteam();
    else await thoroughlyKillEaDesktop();
    const stillRunning = account.kind === 'steam'
      ? await steamIsRunningByTasklist()
      : await eaDesktopIsRunningByTasklist();
    if (stillRunning) {
      toast.error(account.kind === 'steam'
        ? 'toast.cannotCloseSteam'
        : 'toast.cannotCloseEaDesktop');
    }
  } finally {
    forceClosingLauncher.value = false;
    if (apexStore.reset_defaults_dialog) startProcessRefresh(false);
  }
}

watch(
  [
    () => apexStore.reset_defaults_dialog,
    () => apexStore.launcher_selection_key,
  ],
  ([open, accountKey], [wasOpen, previousAccountKey]) => {
    if (open) startProcessRefresh(!wasOpen || accountKey !== previousAccountKey);
    else stopProcessRefresh();
  },
);

onUnmounted(() => stopProcessRefresh());
</script>

<template>
  <v-dialog v-model="apexStore.reset_defaults_dialog" max-width="520" persistent>
    <v-card class="reset-defaults-card" prepend-icon="mdi-restore-alert" :title="t('apex.history.resetTitle')">
      <v-card-text class="reset-defaults-body">
        <p class="reset-description">{{ t('apex.history.resetDescription') }}</p>
        <v-list density="compact" class="reset-scope-list">
          <v-list-item prepend-icon="mdi-rocket-launch-outline" :title="t('apex.history.scopes.launch')"/>
          <v-list-item prepend-icon="mdi-tune-variant" :title="t('apex.history.scopes.video')"/>
          <v-list-item prepend-icon="mdi-gamepad-variant-outline" :title="t('apex.history.scopes.gameSettings')"/>
        </v-list>
        <div class="reset-regenerate-hint">
          <v-icon icon="mdi-information-outline" size="14"/>
          <span>{{ t('apex.history.resetRegenerateHint') }}</span>
        </div>
        <v-alert
          v-if="apexStore.is_launch_options_modified || apexStore.is_video_config_modified || apexStore.is_game_settings_modified"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          {{ t('apex.history.unsavedWarning') }}
        </v-alert>
        <v-alert
          v-if="runningProcesses.length"
          type="error"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          {{ t('apex.history.closeProcesses', {processes: runningProcesses.join(' / ')}) }}
          <template v-if="launcherRunning" #append>
            <v-btn
              class="reset-force-close"
              size="small"
              variant="text"
              :loading="forceClosingLauncher"
              @click="forceCloseLauncher"
            >
              {{ t('apex.history.forceCloseLauncher', {launcher: launcherName}) }}
            </v-btn>
          </template>
        </v-alert>
        <v-alert
          v-else-if="checkFailed"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          {{ t('apex.history.processCheckFailed') }}
        </v-alert>
      </v-card-text>
      <v-card-actions class="reset-defaults-actions">
        <v-btn
          icon="mdi-refresh"
          variant="text"
          :loading="checking"
          :title="t('apex.history.checkProcesses')"
          @click="startProcessRefresh()"
        />
        <v-spacer/>
        <v-btn
          variant="text"
          :disabled="apexStore.is_resetting_defaults"
          @click="apexStore.close_reset_defaults_dialog()"
        >
          {{ t('common.cancel') }}
        </v-btn>
        <v-btn
          color="error"
          variant="flat"
          :loading="apexStore.is_resetting_defaults"
          :disabled="!processStatusReady || checkFailed || !!runningProcesses.length || !apexStore.active_apex_account || forceClosingLauncher"
          @click="apexStore.reset_apex_to_defaults()"
        >
          {{ t('apex.history.resetAction') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.reset-scope-list {
  margin-block: 12px 10px;
  padding: 0;
  border-block: 1px solid rgba(var(--v-border-color), 0.1);
  border-radius: var(--app-radius-sm);
  background: rgba(var(--v-theme-on-surface), 0.018);
}
.reset-defaults-card :deep(.v-card-title) { font-size: 16px; font-weight: 660; }
.reset-defaults-body { padding-top: 8px; color: rgba(var(--v-theme-on-surface), 0.72); }
.reset-description { margin: 0; font-size: 12px; line-height: 1.6; }
.reset-scope-list :deep(.v-list-item) {
  min-height: 34px;
  color: rgba(var(--v-theme-on-surface), 0.76);
  font-size: 12px;
}
.reset-scope-list :deep(.v-icon) {
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 17px;
}
.reset-regenerate-hint {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: rgba(var(--v-theme-on-surface), 0.48);
  font-size: 10.5px;
  line-height: 1.55;
}
.reset-regenerate-hint :deep(.v-icon) {
  flex: 0 0 auto;
  margin-top: 1px;
  color: rgba(var(--v-theme-primary), 0.58);
}
.reset-defaults-body :deep(.v-alert) { font-size: 11px; line-height: 1.5; }
.reset-force-close { min-height: 28px !important; height: 28px !important; font-size: 11px; }
.reset-defaults-actions { padding-top: 6px; }
</style>
