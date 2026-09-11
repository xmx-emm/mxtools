<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {useApexStore} from '@/stores/game/apex.ts';
import {emitApexConfigChanged} from '@/utils/game/apex_config_events.ts';
import CloseRunningProcessesDialog from '@/components/game/common/CloseRunningProcessesDialog.vue';
import {
  detectRunningProcesses,
  useCloseLauncherThenApply,
} from '@/composables/useCloseLauncherThenApply.ts';
import type {
  ApexConfigSnapshotApplySelection,
  ApexConfigSnapshotVideoSelectMode,
} from '@/types/apex_config_snapshot.ts';
import {
  buildVideoConfigPreviewItems,
  splitApexGameSettingsSnapshot,
} from '@/utils/game/apex_config_snapshot.ts';

import {snapshotDetails, type SnapshotBlock} from '@/utils/game/apex_snapshot_details.ts';
import ApexSnapshotSection from './ApexSnapshotSection.vue';
const {t} = useI18n();
const toast = useToast();
const apex_store = useApexStore();
const emit = defineEmits<{(event: 'close'): void; (event: 'busy', value: boolean): void}>();

const import_launch = ref(true);
const import_video = ref(true);
const import_game_settings = ref(true);
const import_aiming = ref(true);
const import_controller = ref(true);
const import_bindings = ref(true);
const video_mode = ref<ApexConfigSnapshotVideoSelectMode>('all');
const selected_video_ids = ref<string[]>([]);

const snapshot = computed(() => apex_store.config_import_snapshot);

const has_launch = computed(() => !!snapshot.value?.launchOptions);
const has_video = computed(() => Object.keys(snapshot.value?.videoConfig ?? {}).length > 0);
const game_setting_groups = computed(() => {
  if (!snapshot.value?.gameSettings) return null;
  return splitApexGameSettingsSnapshot(snapshot.value.gameSettings);
});
const has_game_settings = computed(() => has_group_values('gameSettings'));
const has_aiming = computed(() => has_group_values('aiming'));
const has_controller = computed(() => has_group_values('controller'));
const has_bindings = computed(() => snapshot.value?.gameSettings?.bindings !== undefined);

function has_group_values(group: 'gameSettings' | 'aiming' | 'controller'): boolean {
  const values = game_setting_groups.value?.[group];
  return !!values && (Object.keys(values.settings).length > 0
    || Object.keys(values.profile).length > 0);
}

const video_items = computed(() => {
  if (!snapshot.value?.videoConfig) return [];
  return buildVideoConfigPreviewItems(snapshot.value.videoConfig);
});



const can_apply = computed(() => {
  const launchOk = import_launch.value && has_launch.value;
  const videoOk = import_video.value && has_video.value;
  const gameOk = import_game_settings.value && has_game_settings.value;
  const aimingOk = import_aiming.value && has_aiming.value;
  const controllerOk = import_controller.value && has_controller.value;
  const bindingsOk = import_bindings.value && has_bindings.value;
  if (!launchOk && !videoOk && !gameOk && !aimingOk && !controllerOk && !bindingsOk) {
    return false;
  }
  if (videoOk && video_mode.value === 'items' && selected_video_ids.value.length === 0) {
    return false;
  }
  return true;
});

function reset_from_snapshot() {
  import_launch.value = has_launch.value;
  import_video.value = has_video.value;
  import_game_settings.value = has_game_settings.value;
  import_aiming.value = has_aiming.value;
  import_controller.value = has_controller.value;
  import_bindings.value = has_bindings.value;
  video_mode.value = 'all';
  selected_video_ids.value = video_items.value.map((i) => i.id);
}

watch(video_items, (items) => {
  if (video_mode.value === 'all') {
    selected_video_ids.value = items.map((i) => i.id);
  }
});

function on_close() {
  if (applying.value) return;
  emit('close');
}

function video_item_label(item: {labelKey: string | null; rawKey?: string}): string {
  if (item.labelKey) return t(item.labelKey);
  return item.rawKey ?? '';
}

function build_selection(): ApexConfigSnapshotApplySelection {
  return {
    importLaunchOptions: import_launch.value && has_launch.value,
    importVideoConfig: import_video.value && has_video.value,
    videoSelectMode: video_mode.value,
    selectedVideoItemIds: [...selected_video_ids.value],
    importGameSettings: import_game_settings.value && has_game_settings.value,
    importAiming: import_aiming.value && has_aiming.value,
    importController: import_controller.value && has_controller.value,
    importBindings: import_bindings.value && has_bindings.value,
  };
}

async function run_apply() {
  const snap = snapshot.value;
  if (!snap) return;
  try {
    const ok = await apex_store.apply_config_snapshot(snap, build_selection());
    if (ok) {
      await emitApexConfigChanged(['launch', 'video', 'gameSettings'], {notification: 'snapshotImported'}).catch(error => {
        console.warn('notify snapshot import failed', error);
      });
      emit('busy', false);
      emit('close');
    }
  } catch (err) {
    console.warn('import apex config snapshot failed', err);
    const detail = (err instanceof Error ? err.message : String(err ?? '')).trim();
    toast.error(
      detail
        ? `toast.importApexConfigSnapshotError\n${detail}`
        : 'toast.importApexConfigSnapshotError',
      {timeout: 8000},
    );
  }
}

const {
  dialog,
  close_processes,
  is_thoroughly_kill,
  is_apply_running,
  apply_check,
  force_close_launcher,
  cancel,
} = useCloseLauncherThenApply({
  apply: run_apply,
  beforeApply: async () => {
    if (!can_apply.value) {
      toast.warning('apex.configSnapshot.errors.nothingSelected');
      return false;
    }
    if (import_launch.value && has_launch.value && !apex_store.active_apex_account) {
      toast.error('apex.noLauncherAccount');
      return false;
    }
    return true;
  },
  resolveCloseProcesses: async () => {
    const kinds: Array<'apex' | 'steam' | 'ea'> = ['apex'];
    if (!(import_launch.value && has_launch.value)) return detectRunningProcesses(kinds);
    const acc = apex_store.active_apex_account;
    if (!acc) return detectRunningProcesses(kinds);
    kinds.push(acc.kind);
    return detectRunningProcesses(kinds);
  },
});

const close_steam_apply_user = computed(() => {
  const acc = apex_store.active_apex_account;
  return acc?.kind === 'steam' ? acc.user : null;
});

const applying = computed(
  () => is_apply_running.value || apex_store.is_config_snapshot_applying,
);

watch(snapshot, reset_from_snapshot, {immediate: true});
watch(applying, value => emit('busy', value), {immediate: true});
const import_blocks = [
  {id: 'launch', label: 'blockLaunch', selected: import_launch, available: has_launch},
  {id: 'aiming', label: 'blockAiming', selected: import_aiming, available: has_aiming},
  {id: 'controller', label: 'blockController', selected: import_controller, available: has_controller},
  {id: 'gameSettings', label: 'blockGameSettings', selected: import_game_settings, available: has_game_settings},
  {id: 'bindings', label: 'blockBindings', selected: import_bindings, available: has_bindings},
  {id: 'video', label: 'blockVideo', selected: import_video, available: has_video},
];
function rows(id: string) { return snapshot.value ? snapshotDetails(snapshot.value, id as SnapshotBlock) : []; }
</script>

<template>
  <v-card class="config-import-card">
      <v-card-text class="config-import-body">
        <p class="config-import-hint">
          {{ t('apex.configSnapshot.importHint') }}
        </p>

        <template v-for="block in import_blocks" :key="block.id">
          <ApexSnapshotSection v-if="block.available.value" :model-value="block.selected.value"
            @update:model-value="block.selected.value = $event"
            :title="t('apex.configSnapshot.' + block.label)" :rows="rows(block.id)" :disabled="applying">
            <template v-if="block.id === 'video'">
              <v-btn-toggle v-model="video_mode" mandatory density="compact" color="primary"
                variant="text" border divided class="game-page-segmented-toggle" :disabled="applying">
                <v-btn size="small" value="all">{{ t('apex.configSnapshot.videoModeAll') }}</v-btn>
                <v-btn size="small" value="items">{{ t('apex.configSnapshot.videoModeItems') }}</v-btn>
              </v-btn-toggle>
              <div v-if="video_mode === 'items'">
                <v-checkbox v-for="item in video_items" :key="item.id" v-model="selected_video_ids"
                  :value="item.id" density="compact" hide-details :disabled="applying"
                  :label="video_item_label(item)"/>
              </div>
            </template>
          </ApexSnapshotSection>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer/>
        <v-btn variant="text" :disabled="applying" @click="on_close">
          {{ t('common.cancel') }}
        </v-btn>
        <v-btn
          color="primary"
          :loading="applying"
          :disabled="!can_apply || applying"
          @click="apply_check"
        >
          {{ t('apex.configSnapshot.importAction') }}
        </v-btn>
      </v-card-actions>
  </v-card>

  <CloseRunningProcessesDialog
    v-model="dialog"
    :processes="close_processes"
    :loading="is_thoroughly_kill"
    :steam-user="close_steam_apply_user"
    @force-close="force_close_launcher"
    @cancel="cancel"
  />
</template>

<style scoped>
.config-import-hint { font-size: 12px; color: rgba(var(--v-theme-on-surface), .6); margin: 0 0 12px; }
</style>
