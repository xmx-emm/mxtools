<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {invoke} from '@tauri-apps/api/core';
import {useToast} from 'vue-toastification';
import apexStore from '@/stores/game/apex.ts';
import steamStore from '@/stores/game/steam.ts';
import eaStore from '@/stores/game/ea.ts';
import CloseSteamApplyAccount from '@/components/game/CloseSteamApplyAccount.vue';
import ApexNumberInput from '@/components/game/apex/common/ApexNumberInput.vue';
import ApexLaunchOptionsConfig from '@/data/apex_launch_options_config.ts';
import {
  aspectPresets,
  buildDefaultLaunchOptions,
  FPS_CAP_MAX,
  graphicsQualityPresets,
  quickPresetLaunchOptionToggles,
} from '@/data/presets/apex_quick_preset.ts';
import type {ApexQuickPresetLaunchOptionToggle, ApexQuickPresetSelection, PrimaryDisplayInfo, ResolutionLockAxis} from '@/types/apex_quick_preset.ts';
import {isSteamLaunchOptionsImpl, type SteamLaunchOptionsImpl} from '@/types/steam.ts';
import {
  buildQuickPresetPreview,
  defaultFpsCap,
  findLaunchOptionRef,
  formatAspectRatioLabel,
  initLaunchOptionsForDialog,
} from '@/utils/game/apex_quick_preset.ts';

const { t } = useI18n();
const toast = useToast();
const apex_store = apexStore();
const steam_store = steamStore();
const ea_store = eaStore();

const display_loading = ref(false);
const display_error = ref<string | null>(null);
const local_display = ref<PrimaryDisplayInfo | null>(null);

const fps_cap = ref(144);
const aspect_value = ref(1.7778);
const lock_axis = ref<ResolutionLockAxis>('width');
const enable_resolution_preset = ref(true);
const graphics_preset_id = ref(graphicsQualityPresets[0]?.identifier ?? 'competitive');
const simplified_reticle = ref(true);
const launch_options = ref<Record<string, boolean>>(buildDefaultLaunchOptions());

const launcher_close_dialog = ref(false);
const close_launcher_kind = ref<'steam' | 'ea'>('steam');
const is_thoroughly_kill = ref(false);
const close_poll_id = ref<number | null>(null);

const selection = computed((): ApexQuickPresetSelection => ({
  fpsCap: fps_cap.value,
  aspectValue: aspect_value.value,
  lockAxis: lock_axis.value,
  enableResolutionPreset: enable_resolution_preset.value,
  graphicsPresetId: graphics_preset_id.value,
  enableSimplifiedReticle: simplified_reticle.value,
  launchOptions: launch_options.value,
}));

const resolution_preview = computed(() => {
  if (!local_display.value) return null;
  return buildQuickPresetPreview(local_display.value, selection.value);
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

function stop_close_poll() {
  if (close_poll_id.value == null) return;
  clearInterval(close_poll_id.value);
  close_poll_id.value = null;
}

async function load_display_info() {
  display_loading.value = true;
  display_error.value = null;
  try {
    const info = await invoke<PrimaryDisplayInfo>('get_primary_display_info');
    local_display.value = info;
    apex_store.set_quick_preset_display(info);
    fps_cap.value = defaultFpsCap(info.maxRefreshRate);
    const screenAspect = info.aspectRatio;
    const closest = [...aspectPresets].sort(
      (a, b) => Math.abs(a.aspectValue - screenAspect) - Math.abs(b.aspectValue - screenAspect),
    )[0];
    if (closest) {
      aspect_value.value = closest.aspectValue;
    }
    if (apex_store.original_launch_options === '') {
      await apex_store.start_load_apex_launch_options_data();
    }
    simplified_reticle.value = apex_store.options_selection.some(
      (item) => item.identifier === 'reticle_color',
    );
    launch_options.value = initLaunchOptionsForDialog(apex_store.options_selection);
  } catch (e) {
    display_error.value = String(e);
    local_display.value = null;
  } finally {
    display_loading.value = false;
  }
}

watch(
  () => apex_store.quick_preset_dialog,
  (open) => {
    if (open) {
      void load_display_info();
    } else {
      stop_close_poll();
      launcher_close_dialog.value = false;
    }
  },
);

function on_close() {
  apex_store.close_quick_preset_dialog();
}

function show_launch_option_tip(toggle: ApexQuickPresetLaunchOptionToggle) {
  const ref = findLaunchOptionRef(toggle);
  if (ref) apex_store.showTip(ref);
}

function show_reticle_tip() {
  for (const row of ApexLaunchOptionsConfig) {
    if (isSteamLaunchOptionsImpl(row) && row.identifier === 'reticle_color') {
      apex_store.showTip(row);
      return;
    }
  }
}

async function run_persist() {
  if (!local_display.value) return;
  try {
    await apex_store.ensure_configs_loaded_for_preset();
    apex_store.prepare_quick_preset(local_display.value, selection.value);
    await apex_store.apply_quick_preset_persist();
  } catch (e) {
    if (String(e) === 'Error: GRAPHICS_PRESET_NOT_FOUND') {
      toast.error('apexQuickPreset.graphicsNotFound');
    } else {
      toast.error('apexQuickPreset.applyError');
    }
  }
}

function continuously_monitor_until_closed() {
  stop_close_poll();
  close_poll_id.value = setInterval(async () => {
    let still_running: boolean;
    if (close_launcher_kind.value === 'steam') {
      still_running = await invoke<boolean>('steam_is_running_by_tasklist');
    } else {
      still_running = await invoke<boolean>('ea_desktop_is_running_by_tasklist');
    }
    if (!still_running) {
      stop_close_poll();
      launcher_close_dialog.value = false;
      await run_persist();
    }
  }, 1500) as unknown as number;
}

async function force_close_launcher() {
  is_thoroughly_kill.value = true;
  stop_close_poll();
  if (close_launcher_kind.value === 'steam') {
    await invoke('thoroughly_kill_steam');
    if (await invoke<boolean>('steam_is_running_by_tasklist')) {
      toast.error('toast.cannotCloseSteam');
      is_thoroughly_kill.value = false;
      continuously_monitor_until_closed();
      return;
    }
  } else {
    await invoke('thoroughly_kill_ea_desktop');
    if (await invoke<boolean>('ea_desktop_is_running_by_tasklist')) {
      toast.error('toast.cannotCloseEaDesktop');
      is_thoroughly_kill.value = false;
      continuously_monitor_until_closed();
      return;
    }
  }
  is_thoroughly_kill.value = false;
  launcher_close_dialog.value = false;
  await run_persist();
}

function cancel_launcher_close() {
  launcher_close_dialog.value = false;
  is_thoroughly_kill.value = false;
  stop_close_poll();
}

async function on_apply() {
  if (!apex_store.active_apex_account) {
    toast.warning('apex.noLauncherAccount');
    return;
  }
  if (!local_display.value) {
    toast.error('apexQuickPreset.displayLoadFailed');
    return;
  }

  const acc = apex_store.active_apex_account;
  if (acc.kind === 'ea') {
    await ea_store.check_is_ea_desktop_running();
    if (ea_store.is_ea_desktop_running) {
      close_launcher_kind.value = 'ea';
      launcher_close_dialog.value = true;
      continuously_monitor_until_closed();
      return;
    }
  } else {
    await steam_store.check_is_steam_running();
    if (steam_store.is_steam_running) {
      close_launcher_kind.value = 'steam';
      launcher_close_dialog.value = true;
      continuously_monitor_until_closed();
      return;
    }
  }

  stop_close_poll();
  await run_persist();
}
</script>

<template>
  <v-dialog
    :model-value="apex_store.quick_preset_dialog"
    max-width="520"
    scrollable
    @update:model-value="(v: boolean) => { if (!v) on_close(); }"
  >
    <v-card :title="t('apexQuickPreset.title')">
      <v-card-text>
        <v-progress-linear v-if="display_loading" indeterminate class="mb-3" />
        <v-alert
          v-else-if="display_error"
          type="error"
          density="compact"
          class="mb-3"
          :text="display_error"
        />

        <template v-if="local_display">
          <div class="section-label">{{ t('apexQuickPreset.screenInfo') }}</div>
          <div class="info-grid mb-4">
            <div class="info-item">
              <span class="info-key">{{ t('apexQuickPreset.screenSize') }}</span>
              <span class="info-val">{{ local_display.width }} × {{ local_display.height }}</span>
            </div>
            <div class="info-item">
              <span class="info-key">{{ t('apexQuickPreset.screenAspect') }}</span>
              <span class="info-val">{{ formatAspectRatioLabel(local_display.aspectRatio) }}</span>
            </div>
            <div class="info-item">
              <span class="info-key">{{ t('apexQuickPreset.maxRefresh') }}</span>
              <span class="info-val">{{ local_display.maxRefreshRate }} Hz</span>
            </div>
          </div>

          <div class="section-label">{{ t('apexQuickPreset.fpsCap') }}</div>
          <div class="d-flex align-center gap-2 mb-4 flex-wrap fps-row">
            <ApexNumberInput v-model="fps_cap" :step="1" />
            <span class="text-caption">FPS</span>
            <v-chip size="x-small" variant="tonal">{{ t('apexQuickPreset.fpsCapMax', { max: FPS_CAP_MAX }) }}</v-chip>
            <span class="text-caption text-medium-emphasis">{{ t('apexQuickPreset.lobbyFpsHint') }}</span>
          </div>

          <div class="preset-box mb-4">
            <div class="preset-box-header">
              <v-checkbox
                v-model="enable_resolution_preset"
                :label="t('apexQuickPreset.resolutionAspectSettings')"
                density="compact"
                hide-details
                color="primary"
                class="preset-box-checkbox"
              />
            </div>
            <v-expand-transition>
              <div v-show="enable_resolution_preset" class="preset-box-body">
                <div class="section-label">{{ t('apexQuickPreset.aspectPreset') }}</div>
                <v-btn-toggle
                  v-model="aspect_value"
                  mandatory
                  color="primary"
                  variant="text"
                  class="apex-parameter-toggle aspect-preset-toggle mb-2"
                  style="max-height: 25px"
                  border
                  divided
                >
                  <v-btn
                    v-for="item in aspectPresets"
                    :key="item.aspectValue"
                    :value="item.aspectValue"
                    size="small"
                  >
                    {{ t(item.label) }}
                  </v-btn>
                </v-btn-toggle>

                <v-btn-toggle
                  v-model="lock_axis"
                  mandatory
                  color="primary"
                  variant="text"
                  class="apex-parameter-toggle mb-2"
                  style="max-height: 25px"
                  border
                  divided
                >
                  <v-btn size="small" value="width">{{ t('apexQuickPreset.lockWidth') }}</v-btn>
                  <v-btn size="small" value="height">{{ t('apexQuickPreset.lockHeight') }}</v-btn>
                </v-btn-toggle>

                <div v-if="resolution_preview" class="text-caption">
                  {{ t('apexQuickPreset.resolutionPreview') }}:
                  <strong>{{ resolution_preview.width }} × {{ resolution_preview.height }}</strong>
                  <span v-if="resolution_preview.fromTable" class="text-medium-emphasis">
                    ({{ t('apexQuickPreset.fromTable') }})
                  </span>
                </div>
              </div>
            </v-expand-transition>
          </div>

          <div class="section-label">{{ t('apexQuickPreset.graphicsLabel') }}</div>
          <div class="checkbox-grid mb-2">
            <v-checkbox
              v-for="item in graphicsQualityPresets"
              :key="item.identifier"
              :model-value="graphics_preset_id === item.identifier"
              :label="t(item.name)"
              density="compact"
              hide-details
              color="primary"
              class="compact-checkbox"
              @update:model-value="(v: boolean | null) => { if (v) graphics_preset_id = item.identifier; }"
            />
          </div>
          <div
            v-if="graphicsQualityPresets.find((p) => p.identifier === graphics_preset_id)?.description"
            class="text-caption text-medium-emphasis mb-4"
          >
            {{ t(graphicsQualityPresets.find((p) => p.identifier === graphics_preset_id)!.description!) }}
          </div>

          <div class="section-label mt-2">{{ t('apexQuickPreset.launchOptionsLabel') }}</div>
          <div
            v-for="opt in quickPresetLaunchOptionToggles"
            :key="opt.key"
            class="option-tip-wrap"
            :title="t('apexLaunchOptions.ui.rightClickTip')"
            @contextmenu.prevent="show_launch_option_tip(opt)"
          >
            <v-checkbox
              v-model="launch_options[opt.key]"
              :label="t(opt.label)"
              density="compact"
              hide-details
              color="primary"
              class="compact-checkbox"
            />
          </div>
          <div
            class="option-tip-wrap"
            :title="t('apexLaunchOptions.ui.rightClickTip')"
            @contextmenu.prevent="show_reticle_tip()"
          >
            <v-checkbox
              v-model="simplified_reticle"
              :label="t('apexQuickPreset.simplifiedReticle')"
              density="compact"
              hide-details
              color="primary"
              class="compact-checkbox"
            />
          </div>
        </template>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="on_close">{{ t('common.cancel') }}</v-btn>
        <v-btn
          color="primary"
          :loading="apex_store.quick_preset_applying"
          :disabled="display_loading || !local_display"
          @click="on_apply"
        >
          {{ t('apex.apply') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="launcher_close_dialog" max-width="400" persistent>
    <v-card
      :prepend-icon="close_dialog_icon"
      :title="close_dialog_title"
    >
      <v-card-text>
        <p class="mb-0">{{ close_dialog_text }}</p>
        <CloseSteamApplyAccount
          v-if="close_launcher_kind === 'steam'"
          :user="close_steam_apply_user"
        />
      </v-card-text>
      <template #actions>
        <v-btn color="red" :loading="is_thoroughly_kill" @click="force_close_launcher">
          {{ t('apex.forceClose') }}
        </v-btn>
        <v-spacer />
        <v-btn @click="cancel_launcher_close">{{ t('common.cancel') }}</v-btn>
      </template>
      <template #append>
        <v-progress-circular indeterminate size="16" color="red" width="2" />
      </template>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.section-label {
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 6px;
  color: rgba(var(--v-theme-on-surface), 0.75);
}

.info-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
}

.info-key {
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.gap-2 {
  gap: 8px;
}

.apex-parameter-toggle {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

:deep(.apex-parameter-toggle .v-btn-group) {
  max-width: 100%;
  min-width: 0;
  flex-wrap: wrap;
}

:deep(.apex-parameter-toggle .v-btn) {
  min-width: 0;
  max-width: 100%;
}

.aspect-preset-toggle :deep(.v-btn-group) {
  flex-wrap: nowrap;
}

.aspect-preset-toggle :deep(.v-btn) {
  flex: 1 1 0;
  padding-inline: 6px;
  font-size: 0.75rem;
  height: 25px;
}

.fps-row {
  row-gap: 4px;
}

.checkbox-grid {
  display: flex;
  flex-wrap: wrap;
  column-gap: 12px;
  row-gap: 0;
}

.compact-checkbox {
  flex: 0 0 auto;
}

.compact-checkbox :deep(.v-selection-control) {
  min-height: 28px;
}

.compact-checkbox :deep(.v-label) {
  font-size: 0.8rem;
}

.option-tip-wrap {
  cursor: default;
}

.preset-box {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  overflow: hidden;
}

.preset-box-header {
  padding: 4px 8px 4px 4px;
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.preset-box-checkbox {
  width: 100%;
}

.preset-box-checkbox :deep(.v-label) {
  font-size: 0.8rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.75);
}

.preset-box-body {
  padding: 10px 12px 12px;
}
</style>
