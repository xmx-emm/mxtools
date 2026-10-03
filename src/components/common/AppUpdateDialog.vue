<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {isTauri} from '@tauri-apps/api/core';
import {openUrl} from '@tauri-apps/plugin-opener';
import {useI18n} from 'vue-i18n';
import {useAppUpdateStore} from '@/stores/app_update.ts';
import {useApexStore} from '@/stores/game/apex.ts';
import {usePubgStore} from '@/stores/game/pubg.ts';
import {useDownloadsStore} from '@/stores/downloads.ts';

const {t} = useI18n();
const update = useAppUpdateStore();
const apex = useApexStore();
const pubg = usePubgStore();
const downloads = useDownloadsStore();
const open = ref(false);
const dismissedVersion = ref<string | null>(null);

const blocked = computed(() => apex.is_launch_options_modified || apex.is_video_config_modified
  || apex.is_game_settings_modified || pubg.is_launch_options_modified || downloads.unfinished > 0);

watch(() => [update.phase, update.info?.version] as const, ([phase, version]) => {
  if (phase === 'checking') dismissedVersion.value = null;
  if (phase === 'available' && version && version !== dismissedVersion.value) open.value = true;
}, {immediate: true});

function later() {
  dismissedVersion.value = update.info?.version ?? null;
  open.value = false;
}

function releasePage() {
  void openUrl('https://github.com/xmx-emm/mxtools/releases/latest');
}

async function install() {
  if (blocked.value) return;
  open.value = false;
  await update.install();
}
</script>

<template>
  <v-dialog v-if="isTauri()" v-model="open" max-width="560">
    <v-card :title="t('updates.dialogTitle')">
      <v-card-text>
        <p class="update-version">{{ t('updates.newVersion', {version: update.info?.version}) }}</p>
        <pre v-if="update.info?.notes" class="update-notes">{{ update.info.notes }}</pre>
        <p class="update-hint">{{ t('updates.dialogHint') }}</p>
        <p v-if="blocked" class="text-warning">{{ t('updates.pendingWork') }}</p>
      </v-card-text>
      <v-card-actions>
        <v-spacer/>
        <v-btn variant="text" @click="later">{{ t('updates.later') }}</v-btn>
        <v-btn variant="text" @click="releasePage">{{ t('updates.releases') }}</v-btn>
        <v-btn color="primary" :disabled="blocked || update.busy" :loading="update.phase === 'downloading'" @click="install">
          {{ t('updates.install') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.update-version { margin: 0 0 10px; font-weight: 650; }
.update-notes { max-height: 220px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
.update-hint { margin: 12px 0 0; }
.v-card-actions :deep(.v-btn) { height: var(--app-control-height-action); }
</style>
