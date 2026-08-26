<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {save} from '@tauri-apps/plugin-dialog';
import {useToast} from 'vue-toastification';
import {useApexStore} from '@/stores/game/apex.ts';
import {explorerFolder} from '@/ipc/commands.ts';
import {apexConfigSnapshotFilename} from '@/utils/game/apex_config_snapshot.ts';

const {t} = useI18n();
const toast = useToast();
const apex_store = useApexStore();

const include_launch = ref(true);
const include_video = ref(true);
const include_game_settings = ref(true);
const include_aiming = ref(true);
const include_controller = ref(true);
const include_bindings = ref(true);
const exporting = ref(false);

const can_export = computed(() => include_launch.value || include_video.value
  || include_game_settings.value || include_aiming.value
  || include_controller.value || include_bindings.value);

watch(
  () => apex_store.config_export_dialog,
  (open) => {
    if (open) {
      include_launch.value = true;
      include_video.value = true;
      include_game_settings.value = true;
      include_aiming.value = true;
      include_controller.value = true;
      include_bindings.value = true;
    }
  },
);

function on_close() {
  apex_store.close_config_export_dialog();
}

async function confirm_export() {
  if (!can_export.value || exporting.value) return;
  exporting.value = true;
  try {
    const filename = apexConfigSnapshotFilename();
    let defaultPath = filename;
    try {
      const folder = await explorerFolder();
      if (folder) {
        defaultPath = `${folder}\\${filename}`;
      }
    } catch {
      // ignore default path resolution failures
    }
    const output = await save({
      title: t('apex.configSnapshot.exportTitle'),
      defaultPath,
      filters: [{name: 'JSON', extensions: ['json']}],
    });
    if (!output || typeof output !== 'string') return;

    await apex_store.export_config_snapshot_to_file(output, {
      launchOptions: include_launch.value,
      videoConfig: include_video.value,
      gameSettings: include_game_settings.value,
      aiming: include_aiming.value,
      controller: include_controller.value,
      bindings: include_bindings.value,
    });
    toast.success('toast.exportApexConfigSnapshotSuccess');
    on_close();
  } catch (e) {
    console.warn('export apex config snapshot failed', e);
    const detail = (e instanceof Error ? e.message : String(e ?? '')).trim();
    toast.error(
      detail
        ? `toast.exportApexConfigSnapshotError\n${detail}`
        : 'toast.exportApexConfigSnapshotError',
      {timeout: 8000},
    );
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <v-dialog
    :model-value="apex_store.config_export_dialog"
    max-width="420"
    @update:model-value="(v: boolean) => { if (!v) on_close(); }"
  >
    <v-card :title="t('apex.configSnapshot.exportTitle')">
      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-3">
          {{ t('apex.configSnapshot.exportHint') }}
        </p>
        <v-alert
          type="info"
          variant="tonal"
          density="compact"
          class="mb-3"
          :text="t('apex.configSnapshot.machineLocalExcluded')"
        />
        <v-checkbox
          v-model="include_launch"
          density="compact"
          hide-details
          :label="t('apex.configSnapshot.blockLaunch')"
        />
        <v-checkbox
          v-model="include_aiming"
          density="compact"
          hide-details
          :label="t('apex.configSnapshot.blockAiming')"
        />
        <v-checkbox
          v-model="include_controller"
          density="compact"
          hide-details
          :label="t('apex.configSnapshot.blockController')"
        />
        <v-checkbox
          v-model="include_game_settings"
          density="compact"
          hide-details
          :label="t('apex.configSnapshot.blockGameSettings')"
        />
        <v-checkbox
          v-model="include_bindings"
          density="compact"
          hide-details
          :label="t('apex.configSnapshot.blockBindings')"
        />
        <v-checkbox
          v-model="include_video"
          density="compact"
          hide-details
          :label="t('apex.configSnapshot.blockVideo')"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer/>
        <v-btn variant="text" :disabled="exporting" @click="on_close">
          {{ t('common.cancel') }}
        </v-btn>
        <v-btn
          color="primary"
          :loading="exporting"
          :disabled="!can_export"
          @click="confirm_export"
        >
          {{ t('apex.configSnapshot.exportAction') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
