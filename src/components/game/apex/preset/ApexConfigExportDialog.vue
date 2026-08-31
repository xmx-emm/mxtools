<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {save} from '@tauri-apps/plugin-dialog';
import {useToast} from 'vue-toastification';
import {useApexStore} from '@/stores/game/apex.ts';
import {explorerFolder} from '@/ipc/commands.ts';
import type {ApexConfigSnapshot} from '@/types/apex_config_snapshot.ts';
import {
  apexConfigSnapshotFilename,
  splitApexGameSettingsSnapshot,
} from '@/utils/game/apex_config_snapshot.ts';
import {tokenizeApexLaunchOptions} from '@/utils/game/apex_custom_launch_options.ts';

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
const preview_loading = ref(false);
const preview_failed = ref(false);
const preview_snapshot = ref<ApexConfigSnapshot | null>(null);
let preview_generation = 0;

const preview_groups = computed(() => preview_snapshot.value?.gameSettings
  ? splitApexGameSettingsSnapshot(preview_snapshot.value.gameSettings)
  : null);
const launch_count = computed(() => tokenizeApexLaunchOptions(
  preview_snapshot.value?.launchOptions?.raw ?? '',
).filter(token => token.value.startsWith('+') || token.value.startsWith('-')).length);
const video_count = computed(() => Object.keys(preview_snapshot.value?.videoConfig ?? {}).length);
const game_settings_count = computed(() => Object.keys(preview_groups.value?.gameSettings.settings ?? {}).length
  + Object.keys(preview_groups.value?.gameSettings.profile ?? {}).length);
const aiming_count = computed(() => Object.keys(preview_groups.value?.aiming.settings ?? {}).length
  + Object.keys(preview_groups.value?.aiming.profile ?? {}).length);
const controller_count = computed(() => Object.keys(preview_groups.value?.controller.settings ?? {}).length
  + Object.keys(preview_groups.value?.controller.profile ?? {}).length);
const bindings_count = computed(() => preview_snapshot.value?.gameSettings?.bindings?.length ?? 0);

const can_export = computed(() => !preview_loading.value && !preview_failed.value && (
  include_launch.value
  || (include_video.value && video_count.value > 0)
  || (include_game_settings.value && game_settings_count.value > 0)
  || (include_aiming.value && aiming_count.value > 0)
  || (include_controller.value && controller_count.value > 0)
  || (include_bindings.value && bindings_count.value > 0)
));

async function load_export_preview() {
  const generation = ++preview_generation;
  preview_loading.value = true;
  preview_failed.value = false;
  preview_snapshot.value = null;
  try {
    const next = await apex_store.build_config_snapshot({
      launchOptions: true,
      videoConfig: true,
      gameSettings: true,
      aiming: true,
      controller: true,
      bindings: true,
    });
    if (generation !== preview_generation) return;
    preview_snapshot.value = next;
  } catch (error) {
    if (generation !== preview_generation) return;
    console.warn('load apex config export preview failed', error);
    preview_failed.value = true;
  } finally {
    if (generation === preview_generation) preview_loading.value = false;
  }
}

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
      void load_export_preview();
    }
  },
);

function on_close() {
  preview_generation += 1;
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
    <v-card class="config-export-card" :title="t('apex.configSnapshot.exportTitle')">
      <v-card-text class="config-export-body">
        <p class="config-export-hint">
          {{ t('apex.configSnapshot.exportHint') }}
        </p>
        <div class="config-export-device-note">
          <v-icon icon="mdi-information-outline" size="14"/>
          <span>{{ t('apex.configSnapshot.machineLocalExcluded') }}</span>
        </div>
        <div v-if="preview_loading" class="config-export-status">
          {{ t('apex.configSnapshot.exportPreviewLoading') }}
        </div>
        <div v-else-if="preview_failed" class="config-export-status config-export-status-error">
          {{ t('apex.configSnapshot.exportPreviewFailed') }}
        </div>
        <v-checkbox
          v-model="include_launch"
          density="compact"
          hide-details
          :disabled="preview_loading || preview_failed"
        >
          <template #label>
            <div class="config-export-option-label">
              <span>{{ t('apex.configSnapshot.blockLaunch') }}</span>
              <span>{{ t('apex.configSnapshot.exportItemCount', {count: launch_count}) }}</span>
            </div>
          </template>
        </v-checkbox>
        <v-checkbox
          v-model="include_aiming"
          density="compact"
          hide-details
          :disabled="preview_loading || preview_failed || aiming_count === 0"
        >
          <template #label><div class="config-export-option-label">
            <span>{{ t('apex.configSnapshot.blockAiming') }}</span>
            <span>{{ t('apex.configSnapshot.exportItemCount', {count: aiming_count}) }}</span>
          </div></template>
        </v-checkbox>
        <v-checkbox
          v-model="include_controller"
          density="compact"
          hide-details
          :disabled="preview_loading || preview_failed || controller_count === 0"
        >
          <template #label><div class="config-export-option-label">
            <span>{{ t('apex.configSnapshot.blockController') }}</span>
            <span>{{ t('apex.configSnapshot.exportItemCount', {count: controller_count}) }}</span>
          </div></template>
        </v-checkbox>
        <v-checkbox
          v-model="include_game_settings"
          density="compact"
          hide-details
          :disabled="preview_loading || preview_failed || game_settings_count === 0"
        >
          <template #label><div class="config-export-option-label">
            <span>{{ t('apex.configSnapshot.blockGameSettings') }}</span>
            <span>{{ t('apex.configSnapshot.exportItemCount', {count: game_settings_count}) }}</span>
          </div></template>
        </v-checkbox>
        <v-checkbox
          v-model="include_bindings"
          density="compact"
          hide-details
          :disabled="preview_loading || preview_failed || bindings_count === 0"
        >
          <template #label><div class="config-export-option-label">
            <span>{{ t('apex.configSnapshot.blockBindings') }}</span>
            <span>{{ t('apex.configSnapshot.exportItemCount', {count: bindings_count}) }}</span>
          </div></template>
        </v-checkbox>
        <v-checkbox
          v-model="include_video"
          density="compact"
          hide-details
          :disabled="preview_loading || preview_failed || video_count === 0"
        >
          <template #label><div class="config-export-option-label">
            <span>{{ t('apex.configSnapshot.blockVideo') }}</span>
            <span>{{ t('apex.configSnapshot.exportItemCount', {count: video_count}) }}</span>
          </div></template>
        </v-checkbox>
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

<style scoped>
.config-export-card :deep(.v-card-title) {
  font-size: 16px;
  font-weight: 660;
}

.config-export-body {
  padding-top: 8px;
  color: rgba(var(--v-theme-on-surface), 0.76);
}

.config-export-hint {
  margin: 0 0 10px;
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 11px;
  line-height: 1.5;
}

.config-export-device-note {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-bottom: 8px;
  padding: 7px 9px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  background: rgba(var(--v-theme-on-surface), 0.035);
  border-left: 2px solid rgba(var(--v-theme-primary), 0.42);
  font-size: 10.5px;
  line-height: 1.5;
}

.config-export-device-note :deep(.v-icon) {
  flex: 0 0 auto;
  margin-top: 1px;
  color: rgba(var(--v-theme-primary), 0.58);
}

.config-export-body :deep(.v-checkbox) {
  color: rgba(var(--v-theme-on-surface), 0.8);
}

.config-export-body :deep(.v-checkbox .v-label) {
  flex: 1 1 auto;
  min-width: 0;
}

.config-export-option-label {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  font-size: 12px;
}

.config-export-option-label span:last-child {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.46);
  font-size: 10.5px;
}

.config-export-status {
  padding: 9px 4px;
  color: rgba(var(--v-theme-on-surface), 0.52);
  font-size: 11px;
}

.config-export-status-error {
  color: rgb(var(--v-theme-error));
}
</style>
