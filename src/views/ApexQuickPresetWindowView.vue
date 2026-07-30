<script setup lang="ts">
import {onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {getCurrentWindow} from '@tauri-apps/api/window';
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

const {t} = useI18n();
const apexStore = useApexStore();
const ready = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  void getCurrentWindow().setDecorations(false).catch(() => undefined);
  try {
    await startTauriStoreOnce('apex', () => apexStore.$tauri.start());
    await apexStore.refresh_apex_accounts({silent: true});
    ready.value = true;
  } catch (reason) {
    error.value = String(reason);
  }
});
</script>

<template>
  <v-main class="quick-preset-window-root">
    <AppTopBar :title="t('apexQuickPreset.title')"/>
    <div class="quick-preset-window-body">
      <ApexQuickPresetDialog v-if="ready"/>
      <v-alert
        v-else-if="error"
        type="error"
        variant="tonal"
        class="ma-4"
        :text="error"
      />
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
