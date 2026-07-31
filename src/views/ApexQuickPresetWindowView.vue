<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {useRoute} from 'vue-router';
import type {UnlistenFn} from '@tauri-apps/api/event';
import AppTopBar from '@/components/AppTopBar.vue';
import ApexQuickPresetDialog from '@/components/game/apex/preset/ApexQuickPresetDialog.vue';
import ApexSteamManualDownloadMilesLanguage
  from '@/components/game/apex/launch/language/steam/ApexManualDownloadMilesLanguage.vue';
import ApexEaManualDownloadMilesLanguage
  from '@/components/game/apex/launch/language/ea/ApexManualDownloadMilesLanguage.vue';
import ApexSemiAutomaticDownloadLanguage
  from '@/components/game/apex/launch/language/steam/ApexSemiAutomaticDownloadLanguage.vue';
import {useApexStore} from '@/stores/game/apex.ts';
import {startTauriStoreOnce} from '@/utils/tauri_store.ts';
import {
  latestApexQuickPresetAccount,
  listenApexQuickPresetAccount,
} from '@/utils/game/apex_config_events.ts';

const {t} = useI18n();
const route = useRoute();
const apexStore = useApexStore();
const ready = ref(false);
const error = ref<string | null>(null);
const presetSession = ref(0);
let unlistenAccount: UnlistenFn | null = null;
let unlistenFocus: (() => void) | null = null;
let unlistenClose: (() => void) | null = null;
let initializeGeneration = 0;
let requestedAccountKey = typeof route.query.account === 'string'
  ? route.query.account
  : latestApexQuickPresetAccount();

async function initialize(accountKey = requestedAccountKey) {
  const generation = ++initializeGeneration;
  requestedAccountKey = accountKey;
  ready.value = false;
  error.value = null;
  try {
    await startTauriStoreOnce('apex', () => apexStore.$tauri.start());
    if (generation !== initializeGeneration) return;
    if (accountKey) apexStore.launcher_selection_key = accountKey;
    await apexStore.refresh_apex_accounts({silent: true});
    if (generation !== initializeGeneration) return;
    if (accountKey && apexStore.launcher_selection_key !== accountKey) {
      throw new Error(t('apexQuickPreset.accountUnavailable'));
    }
    presetSession.value += 1;
    ready.value = true;
  } catch (reason) {
    if (generation !== initializeGeneration) return;
    error.value = String(reason);
  }
}

onMounted(async () => {
  const currentWindow = getCurrentWindow();
  void currentWindow.setDecorations(false).catch(() => undefined);
  unlistenAccount = await listenApexQuickPresetAccount(({accountKey}) => {
    if (accountKey === requestedAccountKey) return;
    void initialize(accountKey);
  });
  unlistenFocus = await currentWindow.onFocusChanged(({payload}) => {
    if (!payload) return;
    const accountKey = latestApexQuickPresetAccount();
    if (accountKey !== requestedAccountKey) void initialize(accountKey);
  });
  unlistenClose = await currentWindow.onCloseRequested(event => {
    if (apexStore.quick_preset_applying) event.preventDefault();
  });
  await initialize();
});

onBeforeUnmount(() => {
  unlistenAccount?.();
  unlistenAccount = null;
  unlistenFocus?.();
  unlistenFocus = null;
  unlistenClose?.();
  unlistenClose = null;
});
</script>

<template>
  <v-main class="quick-preset-window-root">
    <AppTopBar
      :title="t('apexQuickPreset.title')"
      :close-disabled="apexStore.quick_preset_applying"
    />
    <div class="quick-preset-window-body">
      <ApexQuickPresetDialog v-if="ready" :key="presetSession"/>
      <v-alert
        v-else-if="error"
        type="error"
        variant="tonal"
        class="ma-4"
        :text="error"
      >
        <template #append>
          <v-btn size="small" variant="text" @click="initialize()">
            {{ t('apexQuickPreset.retry') }}
          </v-btn>
        </template>
      </v-alert>
      <div v-else class="quick-preset-window-loading">
        <v-progress-circular indeterminate color="primary"/>
      </div>
    </div>
    <ApexSteamManualDownloadMilesLanguage
      v-if="apexStore.download_miles_language_manual_dialog"
    />
    <ApexEaManualDownloadMilesLanguage
      v-if="apexStore.download_miles_language_manual_dialog_ea"
    />
    <ApexSemiAutomaticDownloadLanguage
      v-if="apexStore.download_miles_language_semi_automatic_dialog"
    />
  </v-main>
</template>

<style scoped>
.quick-preset-window-root {
  display: flex;
  flex-flow: column;
  height: 100vh;
  overflow: hidden;
  background: rgb(var(--v-theme-surface));
}
.quick-preset-window-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.quick-preset-window-loading {
  display: grid;
  height: 100%;
  place-items: center;
}
</style>
