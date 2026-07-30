<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {useApexStore} from '@/stores/game/apex.ts';
import {useSteamStore} from '@/stores/game/steam.ts';
import {useEaStore} from '@/stores/game/ea.ts';
import CloseSteamApplyAccount from '@/components/game/CloseSteamApplyAccount.vue';
import {
  useCloseLauncherThenApply,
} from '@/composables/useCloseLauncherThenApply.ts';
import {apexIsRunning} from '@/ipc/commands.ts';
import type {
  ApexConfigSnapshotApplySelection,
  ApexConfigSnapshotVideoSelectMode,
} from '@/types/apex_config_snapshot.ts';
import {
  buildVideoConfigPreviewItems,
  splitApexGameSettingsSnapshot,
  truncateLaunchOptionsPreview,
} from '@/utils/game/apex_config_snapshot.ts';

const {t} = useI18n();
const toast = useToast();
const apex_store = useApexStore();
const steam_store = useSteamStore();
const ea_store = useEaStore();

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
const has_video = computed(() => !!snapshot.value?.videoConfig);
const game_setting_groups = computed(() => {
  if (!snapshot.value?.gameSettings) return null;
  return splitApexGameSettingsSnapshot(snapshot.value.gameSettings);
});
const has_game_settings = computed(() => has_group_values('gameSettings'));
const has_aiming = computed(() => has_group_values('aiming'));
const has_controller = computed(() => has_group_values('controller'));
const has_bindings = computed(() => !!snapshot.value?.gameSettings?.bindings?.length);

function has_group_values(group: 'gameSettings' | 'aiming' | 'controller'): boolean {
  const values = game_setting_groups.value?.[group];
  return !!values && (Object.keys(values.settings).length > 0
    || Object.keys(values.profile).length > 0);
}

const video_items = computed(() => {
  if (!snapshot.value?.videoConfig) return [];
  return buildVideoConfigPreviewItems(snapshot.value.videoConfig);
});

const launch_preview = computed(() => {
  const raw = snapshot.value?.launchOptions?.raw ?? '';
  return truncateLaunchOptionsPreview(raw);
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

watch(
  () => apex_store.config_import_dialog,
  (open) => {
    if (open) {
      reset_from_snapshot();
    } else {
      cancel();
    }
  },
  {immediate: true},
);

watch(video_items, (items) => {
  if (video_mode.value === 'all') {
    selected_video_ids.value = items.map((i) => i.id);
  }
});

function on_close() {
  apex_store.close_config_import_dialog();
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
      on_close();
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
  close_launcher_kind,
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
    if ((import_game_settings.value || import_aiming.value
      || import_controller.value || import_bindings.value) && await apexIsRunning()) {
      toast.error('apex.gameSettings.errors.apexRunning');
      return false;
    }
    return true;
  },
  resolveCloseKind: async () => {
    // 仅导入启动项时需要关启动器；纯视频导入直接写盘
    if (!(import_launch.value && has_launch.value)) {
      return null;
    }
    const acc = apex_store.active_apex_account;
    if (!acc) return null;
    if (acc.kind === 'ea') {
      await ea_store.check_is_ea_desktop_running();
      return ea_store.is_ea_desktop_running ? 'ea' : null;
    }
    await steam_store.check_is_steam_running();
    return steam_store.is_steam_running ? 'steam' : null;
  },
});

const close_dialog_title = computed(() =>
  close_launcher_kind.value === 'steam' ? t('apex.closeSteam') : t('apex.closeEaDesktop'),
);

const close_dialog_text = computed(() =>
  close_launcher_kind.value === 'steam' ? t('apex.closeSteamTip') : t('apex.closeEaDesktopTip'),
);

const close_dialog_icon = computed(() =>
  close_launcher_kind.value === 'steam' ? 'mdi-steam' : 'mdi-alpha-e-circle',
);

const close_steam_apply_user = computed(() => {
  const acc = apex_store.active_apex_account;
  return acc?.kind === 'steam' ? acc.user : null;
});

const applying = computed(
  () => is_apply_running.value || apex_store.is_config_snapshot_applying,
);
</script>

<template>
  <v-dialog
    :model-value="apex_store.config_import_dialog"
    max-width="560"
    scrollable
    @update:model-value="(v: boolean) => { if (!v) on_close(); }"
  >
    <v-card :title="t('apex.configSnapshot.importTitle')">
      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-3">
          {{ t('apex.configSnapshot.importHint') }}
        </p>
        <v-alert
          type="info"
          variant="tonal"
          density="compact"
          class="mb-3"
          :text="t('apex.configSnapshot.machineLocalExcluded')"
        />

        <template v-if="has_launch">
          <v-checkbox
            v-model="import_launch"
            density="compact"
            hide-details
            :label="t('apex.configSnapshot.blockLaunch')"
          />
          <div
            v-if="import_launch"
            class="preview-box mb-3"
          >
            <div class="text-caption text-medium-emphasis mb-1">
              {{ t('apex.configSnapshot.launchPreview') }}
            </div>
            <code class="preview-code">{{ launch_preview || t('apex.configSnapshot.emptyLaunch') }}</code>
          </div>
        </template>

        <template v-if="has_game_settings">
          <v-checkbox
            v-model="import_game_settings"
            density="compact"
            hide-details
            :label="t('apex.configSnapshot.blockGameSettings')"
          />
          <div v-if="import_game_settings" class="preview-box mb-3 text-caption text-medium-emphasis">
            {{ t('apex.configSnapshot.gameSettingsPreview', {
              settings: Object.keys(game_setting_groups?.gameSettings.settings ?? {}).length,
              profile: Object.keys(game_setting_groups?.gameSettings.profile ?? {}).length,
            }) }}
          </div>
        </template>

        <template v-if="has_aiming">
          <v-checkbox
            v-model="import_aiming"
            density="compact"
            hide-details
            :label="t('apex.configSnapshot.blockAiming')"
          />
          <div v-if="import_aiming" class="preview-box mb-3 text-caption text-medium-emphasis">
            {{ t('apex.configSnapshot.settingsBlockPreview', {
              count: Object.keys(game_setting_groups?.aiming.settings ?? {}).length
                + Object.keys(game_setting_groups?.aiming.profile ?? {}).length,
            }) }}
          </div>
        </template>

        <template v-if="has_controller">
          <v-checkbox
            v-model="import_controller"
            density="compact"
            hide-details
            :label="t('apex.configSnapshot.blockController')"
          />
          <div v-if="import_controller" class="preview-box mb-3 text-caption text-medium-emphasis">
            {{ t('apex.configSnapshot.settingsBlockPreview', {
              count: Object.keys(game_setting_groups?.controller.settings ?? {}).length
                + Object.keys(game_setting_groups?.controller.profile ?? {}).length,
            }) }}
          </div>
        </template>

        <template v-if="has_bindings">
          <v-checkbox
            v-model="import_bindings"
            density="compact"
            hide-details
            :label="t('apex.configSnapshot.blockBindings')"
          />
          <div v-if="import_bindings" class="preview-box mb-3 text-caption text-medium-emphasis">
            {{ t('apex.configSnapshot.bindingsPreview', {
              count: snapshot?.gameSettings?.bindings?.length ?? 0,
            }) }}
          </div>
        </template>

        <template v-if="has_video">
          <v-checkbox
            v-model="import_video"
            density="compact"
            hide-details
            class="mb-2"
            :label="t('apex.configSnapshot.blockVideo')"
          />
          <template v-if="import_video">
            <v-btn-toggle
              v-model="video_mode"
              mandatory
              density="compact"
              variant="outlined"
              class="mb-3"
            >
              <v-btn size="small" value="all">
                {{ t('apex.configSnapshot.videoModeAll') }}
              </v-btn>
              <v-btn size="small" value="items">
                {{ t('apex.configSnapshot.videoModeItems') }}
              </v-btn>
            </v-btn-toggle>

            <div class="video-preview-list">
              <div class="text-caption text-medium-emphasis mb-2">
                {{ t('apex.configSnapshot.videoPreview') }}
              </div>
              <template v-if="video_mode === 'all'">
                <div
                  v-for="item in video_items"
                  :key="item.id"
                  class="video-preview-row"
                >
                  <div class="video-preview-name">{{ video_item_label(item) }}</div>
                  <div class="video-preview-values text-caption">{{ item.valuesPreview }}</div>
                </div>
              </template>
              <template v-else>
                <v-checkbox
                  v-for="item in video_items"
                  :key="item.id"
                  v-model="selected_video_ids"
                  :value="item.id"
                  density="compact"
                  hide-details
                  class="video-item-check"
                >
                  <template #label>
                    <div class="video-check-label">
                      <span>{{ video_item_label(item) }}</span>
                      <span class="text-caption text-medium-emphasis">{{ item.valuesPreview }}</span>
                    </div>
                  </template>
                </v-checkbox>
              </template>
            </div>
          </template>
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
          :disabled="!can_apply"
          @click="apply_check"
        >
          {{ t('apex.configSnapshot.importAction') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog
    v-model="dialog"
    max-width="420"
    persistent
  >
    <v-card :prepend-icon="close_dialog_icon" :title="close_dialog_title">
      <v-card-text>
        <p>{{ close_dialog_text }}</p>
        <CloseSteamApplyAccount
          v-if="close_launcher_kind === 'steam' && close_steam_apply_user"
          :user="close_steam_apply_user"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer/>
        <v-btn variant="text" :disabled="is_thoroughly_kill" @click="cancel">
          {{ t('common.cancel') }}
        </v-btn>
        <v-btn
          color="error"
          variant="flat"
          :loading="is_thoroughly_kill"
          @click="force_close_launcher"
        >
          {{ t('apex.forceClose') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.preview-box {
  margin-left: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(var(--v-theme-surface-variant), 0.25);
}

.preview-code {
  display: block;
  font-size: 12px;
  word-break: break-all;
  white-space: pre-wrap;
}

.video-preview-list {
  max-height: 280px;
  overflow: auto;
  margin-left: 4px;
  padding-right: 4px;
}

.video-preview-row {
  padding: 6px 0;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.video-preview-name {
  font-size: 13px;
  font-weight: 500;
}

.video-preview-values {
  opacity: 0.75;
  word-break: break-all;
}

.video-check-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.3;
}

.video-item-check {
  margin-inline-start: 0;
}
</style>
