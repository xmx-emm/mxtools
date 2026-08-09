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
      <div v-else-if="error" class="quick-preset-window-state">
        <v-alert
          type="error"
          variant="tonal"
          density="compact"
          class="quick-preset-window-error"
          :text="error"
        >
          <template #append>
            <v-btn
              class="quick-preset-window-retry"
              variant="text"
              prepend-icon="mdi-refresh"
              @click="initialize()"
            >
              {{ t('apexQuickPreset.retry') }}
            </v-btn>
          </template>
        </v-alert>
      </div>
      <div v-else class="quick-preset-window-state quick-preset-window-loading">
        <v-progress-circular indeterminate color="primary" :size="24" :width="2"/>
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
  color: rgba(var(--v-theme-on-surface), 0.9);
  background: rgb(var(--v-theme-background));
  letter-spacing: 0;
}

.quick-preset-window-body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  padding: 14px 18px 16px;
  overflow: hidden;
  box-sizing: border-box;
}

.quick-preset-window-body > * {
  flex: 1 1 auto;
  min-height: 0;
}

.quick-preset-window-state {
  display: flex;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-layer-raised);
}

.quick-preset-window-error {
  width: 100%;
  margin: 0 !important;
  border-radius: 0 !important;
  font-size: 11px;
  line-height: 1.5;
}

.quick-preset-window-retry.v-btn {
  min-height: var(--app-control-height-compact) !important;
  height: var(--app-control-height-compact) !important;
  padding-inline: 8px !important;
  border-radius: var(--app-radius-sm) !important;
  letter-spacing: 0;
  text-transform: none;
}

.quick-preset-window-loading {
  display: grid;
  place-items: center;
}

@media (max-width: 640px) {
  .quick-preset-window-body {
    padding: 10px;
  }
}
</style>
