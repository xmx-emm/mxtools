<script setup lang="ts">
import {ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {useApexStore} from '@/stores/game/apex.ts';
import {
  apexIsRunning,
  eaDesktopIsRunningByTasklist,
  steamIsRunningByTasklist,
} from '@/ipc/commands.ts';

const apexStore = useApexStore();
const {t} = useI18n();
const checking = ref(false);
const runningProcesses = ref<string[]>([]);

async function checkProcesses() {
  const account = apexStore.active_apex_account;
  if (!account || checking.value) return;
  checking.value = true;
  try {
    const [gameRunning, launcherRunning] = await Promise.all([
      apexIsRunning().catch(() => false),
      account.kind === 'steam'
        ? steamIsRunningByTasklist().catch(() => false)
        : eaDesktopIsRunningByTasklist().catch(() => false),
    ]);
    runningProcesses.value = [
      ...(gameRunning ? ['Apex Legends'] : []),
      ...(launcherRunning ? [account.kind === 'steam' ? 'Steam' : 'EA Desktop'] : []),
    ];
  } finally {
    checking.value = false;
  }
}

watch(
  () => apexStore.reset_defaults_dialog,
  open => {
    if (open) void checkProcesses();
    else runningProcesses.value = [];
  },
);
</script>

<template>
  <v-dialog v-model="apexStore.reset_defaults_dialog" max-width="520" persistent>
    <v-card prepend-icon="mdi-restore-alert" :title="t('apex.history.resetTitle')">
      <v-card-text>
        <p>{{ t('apex.history.resetDescription') }}</p>
        <v-list density="compact" class="reset-scope-list mb-3">
          <v-list-item prepend-icon="mdi-rocket-launch-outline" :title="t('apex.history.scopes.launch')"/>
          <v-list-item prepend-icon="mdi-tune-variant" :title="t('apex.history.scopes.video')"/>
          <v-list-item prepend-icon="mdi-gamepad-variant-outline" :title="t('apex.history.scopes.gameSettings')"/>
        </v-list>
        <v-alert type="info" variant="tonal" density="compact">
          {{ t('apex.history.resetRegenerateHint') }}
        </v-alert>
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
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-btn
          icon="mdi-refresh"
          variant="text"
          :loading="checking"
          :title="t('apex.history.checkProcesses')"
          @click="checkProcesses"
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
          :disabled="checking || !!runningProcesses.length || !apexStore.active_apex_account"
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
  padding: 0;
  border: 1px solid rgba(var(--v-border-color), 0.12);
  border-radius: var(--app-radius-sm);
}
</style>
