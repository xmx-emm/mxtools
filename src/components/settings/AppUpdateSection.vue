<script setup lang="ts">
import {computed, ref} from 'vue';
import {isTauri} from '@tauri-apps/api/core';
import {openUrl} from '@tauri-apps/plugin-opener';
import {useI18n} from 'vue-i18n';
import {useAppUpdateStore} from '@/stores/app_update.ts';
import {useSettingsStore} from '@/stores/settings.ts';
import {useApexStore} from '@/stores/game/apex.ts';
import {usePubgStore} from '@/stores/game/pubg.ts';
import {useDownloadsStore} from '@/stores/downloads.ts';

const {t} = useI18n();
const update = useAppUpdateStore();
const settings = useSettingsStore();
const apex = useApexStore();
const pubg = usePubgStore();
const downloads = useDownloadsStore();
const confirm = ref(false);
const blocked = computed(() => apex.is_launch_options_modified || apex.is_video_config_modified
  || apex.is_game_settings_modified || pubg.is_launch_options_modified || downloads.unfinished > 0);
const status = computed(() => update.info?.availability && update.info.availability !== 'ready'
  ? update.info.availability : update.phase);
function releasePage() { void openUrl('https://github.com/xmx-emm/mxtools/releases/latest'); }
async function install() {
  if (blocked.value) return;
  confirm.value = false;
  await update.install();
}
</script>

<template>
  <section class="app-section settings-section">
    <header class="update-heading"><h2>{{ t('updates.title') }}</h2><span v-if="update.info">{{ update.info.currentVersion }}</span></header>
    <label class="update-preference">
      <span>{{ t('updates.automatic') }}</span>
      <v-switch v-model="settings.autoCheckUpdates" hide-details density="compact" color="primary"/>
    </label>
    <p role="status">{{ t('updates.' + status) }}</p>
    <p v-if="update.info?.version">{{ t('updates.newVersion', {version: update.info.version}) }}</p>
    <pre v-if="update.info?.notes" class="update-notes">{{ update.info.notes }}</pre>
    <p v-if="update.error" class="text-error">{{ update.error }}</p>
    <v-progress-linear v-if="update.phase === 'downloading'" :model-value="update.percent ?? 0"
      :indeterminate="update.percent === null" color="primary" height="6"/>
    <p v-if="update.percent !== null && update.phase === 'downloading'">{{ update.percent.toFixed(1) }}%</p>
    <p v-if="blocked && update.info?.version" class="text-warning">{{ t('updates.pendingWork') }}</p>
    <div class="update-actions">
      <v-btn variant="text" :disabled="!isTauri() || update.busy" :loading="update.phase === 'checking'" @click="update.check()">{{ t('updates.check') }}</v-btn>
      <v-btn v-if="update.phase === 'available'" variant="tonal" color="primary" :disabled="blocked" @click="confirm = true">{{ t('updates.install') }}</v-btn>
      <v-btn variant="text" :disabled="!isTauri() || update.busy" @click="releasePage">{{ t('updates.releases') }}</v-btn>
    </div>
    <v-dialog v-model="confirm" max-width="480">
      <v-card :title="t('updates.install')">
        <v-card-text>{{ t('updates.installHint') }}</v-card-text>
        <v-card-actions><v-spacer/><v-btn @click="confirm = false">{{ t('updates.later') }}</v-btn><v-btn color="primary" :disabled="blocked" @click="install">{{ t('updates.install') }}</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.update-heading,.update-preference { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.update-heading h2 { font-size:15px; }
.update-heading span,p,.update-preference { font-size:12px; }
.update-preference :deep(.v-input) { flex:0 0 auto; }
.update-notes { white-space:pre-wrap; overflow-wrap:anywhere; max-height:180px; overflow:auto; font:inherit; font-size:12px; }
.update-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
.update-actions :deep(.v-btn) { height:var(--app-control-height-compact); }
</style>
