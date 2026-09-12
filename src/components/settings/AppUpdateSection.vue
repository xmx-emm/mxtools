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
    <header class="settings-section-header">
      <span class="settings-section-icon"><v-icon icon="mdi-download" size="18"/></span>
      <div>
        <h2>{{ t('updates.title') }}</h2>
        <p role="status">{{ t('updates.' + status) }}</p>
      </div>
      <span v-if="update.info" class="update-version">{{ update.info.currentVersion }}</span>
    </header>
    <div class="settings-rows">
      <label class="setting-row">
        <span><strong>{{ t('updates.automatic') }}</strong></span>
        <v-switch v-model="settings.autoCheckUpdates" hide-details color="primary"/>
      </label>
    </div>
    <div class="update-details">
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
.settings-section { overflow: hidden; }
.settings-section-header { display: flex; align-items: flex-start; gap: 11px; padding: 17px 18px 14px; }
.settings-section-header > div { min-width: 0; }
.settings-section-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; flex: 0 0 34px; border-radius: 10px;
  color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.09);
}
.settings-section-header h2 { margin: 0; font-size: 13px; font-weight: 680; }
.settings-section-header p { margin: 3px 0 0; color: rgba(var(--v-theme-on-surface), 0.5); font-size: 10px; line-height: 1.5; }
.update-version { margin-left: auto; color: rgba(var(--v-theme-on-surface), 0.5); font-size: 10px; }
.settings-rows { border-top: 1px solid var(--app-border); }
.setting-row { display: flex; align-items: center; justify-content: space-between; min-height: 60px; gap: 20px; padding: 10px 18px; }
.setting-row > span { min-width: 0; }
.setting-row strong { font-size: 11px; font-weight: 620; }
.setting-row :deep(.v-switch) { flex: 0 0 auto; }
.update-details { padding: 0 18px 18px; font-size: 11px; line-height: 1.5; }
.update-details p { margin: 0 0 8px; overflow-wrap: anywhere; }
.update-notes { white-space:pre-wrap; overflow-wrap:anywhere; max-height:180px; overflow:auto; font:inherit; font-size:12px; }
.update-actions { display:flex; flex-wrap:wrap; gap:8px; }
.update-actions :deep(.v-btn) { height:var(--app-control-height-compact); }
.v-card-actions :deep(.v-btn) { height: var(--app-control-height-action); }
</style>
