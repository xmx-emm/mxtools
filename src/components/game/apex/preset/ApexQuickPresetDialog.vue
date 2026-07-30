<script setup lang="ts">
import {computed, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {getPrimaryDisplayInfo} from '@/ipc/commands.ts';
import {useToast} from 'vue-toastification';
import {useApexStore} from '@/stores/game/apex.ts';
import {useSteamStore} from '@/stores/game/steam.ts';
import {useEaStore} from '@/stores/game/ea.ts';
import CloseSteamApplyAccount from '@/components/game/CloseSteamApplyAccount.vue';
import ApexNumberInput from '@/components/game/apex/common/ApexNumberInput.vue';
import ApexLaunchOptionsConfig from '@/data/apex_launch_options_config.ts';
import ApexVideoConfig from '@/data/apex_video_config.ts';
import {
  buildDefaultGameSettingOptions,
  buildDefaultLaunchOptions,
  buildDefaultVideoOptions,
  FPS_CAP_MAX,
  FPS_CAP_MIN,
  graphicsQualityPresets,
  quickPresetLaunchOptionToggles,
  quickPresetGameSettingToggles,
  quickPresetVideoConfigToggles,
  sortedAspectPresets,
} from '@/data/presets/apex_quick_preset.ts';
import type {
  ApexQuickPresetLaunchOptionToggle,
  ApexQuickPresetSelection,
  ApexQuickPresetVideoToggle,
  PrimaryDisplayInfo,
  ResolutionLockAxis,
} from '@/types/apex_quick_preset.ts';
import {isApexVideoConfigImpl} from '@/types/apex.ts';
import {isSteamLaunchOptionsImpl} from '@/types/steam.ts';
import {
  buildQuickPresetPreview,
  clampFpsCap,
  defaultFpsCap,
  findLaunchOptionRef,
  formatAspectRatioLabel,
  initLaunchOptionsForDialog,
  initVideoOptionsForDialog,
  resolveQuickPresetInitialAspectValue,
} from '@/utils/game/apex_quick_preset.ts';
import {useCloseLauncherThenApply} from '@/composables/useCloseLauncherThenApply.ts';
import {getCurrentWindow} from '@tauri-apps/api/window';
import ApexGameSettingTip from '@/components/game/apex/settings/ApexGameSettingTip.vue';

const { t } = useI18n();
const toast = useToast();
const apex_store = useApexStore();
const steam_store = useSteamStore();
const ea_store = useEaStore();

const display_loading = ref(false);
const display_error = ref<string | null>(null);
const local_display = ref<PrimaryDisplayInfo | null>(null);

const fps_cap = ref(144);
const aspect_value = ref<number | null>(null);
const lock_axis = ref<ResolutionLockAxis>('width');
const enable_resolution_preset = ref(true);
const enable_graphics_preset = ref(true);
const graphics_preset_id = ref(graphicsQualityPresets[0]?.identifier ?? 'competitive');
const simplified_reticle = ref(true);
const launch_options = ref<Record<string, boolean>>(buildDefaultLaunchOptions());
const video_options = ref<Record<string, boolean>>(buildDefaultVideoOptions());
const game_setting_options = ref<Record<string, boolean>>(buildDefaultGameSettingOptions());

const sorted_aspect_presets = computed(() => sortedAspectPresets());

function build_selection(): ApexQuickPresetSelection {
  return {
    fpsCap: clampFpsCap(fps_cap.value),
    aspectValue: aspect_value.value!,
    lockAxis: lock_axis.value,
    enableResolutionPreset: enable_resolution_preset.value,
    enableGraphicsPreset: enable_graphics_preset.value,
    graphicsPresetId: graphics_preset_id.value,
    enableSimplifiedReticle: simplified_reticle.value,
    launchOptions: launch_options.value,
    videoOptions: video_options.value,
    gameSettingOptions: game_setting_options.value,
  };
}

const resolution_preview = computed(() => {
  if (!local_display.value || aspect_value.value == null) return null;
  return buildQuickPresetPreview(local_display.value, {
    aspectValue: aspect_value.value,
    lockAxis: lock_axis.value,
  });
});

async function load_display_info() {
  display_loading.value = true;
  display_error.value = null;
  try {
    const info = await getPrimaryDisplayInfo();
    local_display.value = info;
    apex_store.set_quick_preset_display(info);
    fps_cap.value = defaultFpsCap(info.maxRefreshRate);
    const key = apex_store.launcher_selection_key;
    if (!key || apex_store.launch_loaded_for_key !== key) {
      await apex_store.start_load_apex_launch_options_data();
    }
    if (Object.keys(apex_store.video_config_values).length === 0) {
      await apex_store.load_apex_video_config();
    }
    if (!apex_store.game_settings_report) {
      await apex_store.load_apex_game_settings();
    }
    const has_letterbox = apex_store.options_selection.some(
      (item) => item.identifier === 'letterbox_aspect',
    );
    aspect_value.value = resolveQuickPresetInitialAspectValue(
      has_letterbox,
      apex_store.mat_letterbox_aspect_goal,
      info.aspectRatio,
    );
    simplified_reticle.value = apex_store.options_selection.some(
      (item) => item.identifier === 'reticle_color',
    );
    launch_options.value = initLaunchOptionsForDialog(apex_store.options_selection);
    video_options.value = initVideoOptionsForDialog(apex_store.video_config_values);
  } catch (e) {
    display_error.value = String(e);
    local_display.value = null;
  } finally {
    display_loading.value = false;
  }
}

function on_close() {
  void getCurrentWindow().close();
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

function show_video_option_tip(toggle: ApexQuickPresetVideoToggle) {
  if (!toggle.tipIdentifier) return;
  for (const row of ApexVideoConfig) {
    if (typeof row === 'string') continue;
    if (isApexVideoConfigImpl(row) && row.identifier === toggle.tipIdentifier) {
      apex_store.showTip(row);
      return;
    }
  }
}

function show_game_setting_tip(fieldId: string) {
  apex_store.showTip({
    tip: ApexGameSettingTip,
    tipProps: {fieldId},
  });
}

async function run_persist() {
  if (!local_display.value) return;
  if (enable_resolution_preset.value && aspect_value.value == null) {
    toast.warning('apexQuickPreset.selectAspect');
    return;
  }
  try {
    await apex_store.ensure_configs_loaded_for_preset();
    apex_store.prepare_quick_preset(local_display.value, build_selection());
    const applied = await apex_store.apply_quick_preset_persist();
    if (applied) {
      await getCurrentWindow().close();
    }
  } catch (e) {
    if (String(e) === 'Error: GRAPHICS_PRESET_NOT_FOUND') {
      toast.error('apexQuickPreset.graphicsNotFound');
    } else {
      const detail = (e instanceof Error ? e.message : String(e ?? '')).trim();
      toast.error(
        detail ? `apexQuickPreset.applyError\n${detail}` : 'apexQuickPreset.applyError',
        {timeout: 8000},
      );
    }
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
  apply: run_persist,
  beforeApply: async () => {
    if (!apex_store.active_apex_account) {
      toast.warning('apex.noLauncherAccount');
      return false;
    }
    if (!local_display.value) {
      toast.error('apexQuickPreset.displayLoadFailed');
      return false;
    }
    if (enable_resolution_preset.value && aspect_value.value == null) {
      toast.warning('apexQuickPreset.selectAspect');
      return false;
    }
    if (!await apex_store.check_miles_language()) {
      toast.error('toast.milesLanguageNotFound');
      if (apex_store.active_apex_account?.kind === 'ea') {
        apex_store.download_miles_language_manual_dialog_ea = true;
      } else {
        apex_store.download_miles_language_semi_automatic_dialog = true;
      }
      return false;
    }
    return true;
  },
  resolveCloseKind: async () => {
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

void load_display_info();
</script>

<template>
  <div class="quick-preset-shell--window">
    <v-card
      :title="t('apexQuickPreset.title')"
      class="quick-preset-card--window"
    >
      <v-card-text>
        <v-progress-linear v-if="display_loading" indeterminate class="mb-3"/>
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
            <ApexNumberInput v-model="fps_cap" :step="1" :min="FPS_CAP_MIN" :max="FPS_CAP_MAX"/>
            <span class="text-caption">FPS</span>
            <v-chip size="x-small" variant="tonal">{{ t('apexQuickPreset.fpsCapRange', { min: FPS_CAP_MIN, max: FPS_CAP_MAX }) }}</v-chip>
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
                <div>
                  <v-btn-toggle
                    v-model="lock_axis"
                    mandatory
                    density="compact"
                    color="primary"
                    variant="text"
                    class="apex-parameter-toggle game-page-segmented-toggle mb-2"
                    border
                    divided
                  >
                    <v-btn size="small" value="width">{{ t('apexQuickPreset.lockWidth') }}</v-btn>
                    <v-btn size="small" value="height">{{ t('apexQuickPreset.lockHeight') }}</v-btn>
                  </v-btn-toggle>
                </div>
                <div>
                  <v-btn-toggle
                    v-model="aspect_value"
                    density="compact"
                    color="primary"
                    variant="text"
                    class="apex-parameter-toggle aspect-preset-toggle game-page-segmented-toggle mb-2"
                    border
                    divided
                  >
                    <v-btn
                      v-for="item in sorted_aspect_presets"
                      :key="item.aspectValue"
                      :value="item.aspectValue"
                      size="small"
                    >
                      {{ t(item.label) }}
                    </v-btn>
                  </v-btn-toggle>
                </div>

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

          <div class="preset-box mb-4">
            <div class="preset-box-header">
              <v-checkbox
                v-model="enable_graphics_preset"
                :label="t('apexQuickPreset.graphicsSettingsLabel')"
                density="compact"
                hide-details
                color="primary"
                class="preset-box-checkbox"
              />
            </div>
            <v-expand-transition>
              <div v-show="enable_graphics_preset" class="preset-box-body">
                <v-btn-toggle
                  v-model="graphics_preset_id"
                  mandatory
                  density="compact"
                  color="primary"
                  variant="text"
                  class="apex-parameter-toggle graphics-preset-toggle game-page-segmented-toggle mb-2"
                  border
                  divided
                >
                  <v-btn
                    v-for="item in graphicsQualityPresets"
                    :key="item.identifier"
                    :value="item.identifier"
                    size="small"
                  >
                    {{ t(item.name) }}
                  </v-btn>
                </v-btn-toggle>
                <div
                  v-if="graphicsQualityPresets.find((p) => p.identifier === graphics_preset_id)?.description"
                  class="text-caption text-medium-emphasis"
                >
                  {{ t(graphicsQualityPresets.find((p) => p.identifier === graphics_preset_id)!.description!) }}
                </div>
              </div>
            </v-expand-transition>
          </div>

          <div class="preset-options-columns mt-2">
            <div class="preset-options-column">
              <div class="section-label">{{ t('apexQuickPreset.launchOptionsLabel') }}</div>
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
            </div>

            <div class="preset-options-column">
              <div class="section-label">{{ t('apexQuickPreset.videoConfigLabel') }}</div>
              <div
                v-for="opt in quickPresetVideoConfigToggles"
                :key="opt.key"
                class="option-tip-wrap"
                :title="t('apexLaunchOptions.ui.rightClickTip')"
                @contextmenu.prevent="show_video_option_tip(opt)"
              >
                <v-checkbox
                  v-model="video_options[opt.key]"
                  :label="t(opt.label)"
                  density="compact"
                  hide-details
                  color="primary"
                  class="compact-checkbox"
                />
              </div>
            </div>
          </div>

          <div class="preset-box mt-4">
            <div class="preset-box-header section-label mb-0 px-3 py-2">
              {{ t('apexQuickPreset.gameOptimizationsLabel') }}
            </div>
            <div class="preset-box-body preset-optimization-grid">
              <div>
                <div
                  v-for="opt in quickPresetGameSettingToggles"
                  :key="opt[0]"
                  class="option-tip-wrap"
                  :title="t('apexLaunchOptions.ui.rightClickTip')"
                  @contextmenu.prevent="show_game_setting_tip(opt[0])"
                >
                  <v-checkbox
                    v-model="game_setting_options[opt[0]]"
                    :label="t(`apexGameSettings.fields.${opt[0]}.name`)"
                    density="compact"
                    hide-details
                    color="primary"
                    class="compact-checkbox"
                  />
                </div>
              </div>
              <div class="preset-binding-summary text-caption">
                <strong>{{ t('apexQuickPreset.bindingOptimizationsLabel') }}</strong>
                <span>MOUSE2 → {{ t('apexGameSettings.bindings.holdAim') }}</span>
                <span>MWHEELUP → {{ t('apexGameSettings.bindings.moveForward') }}</span>
                <span>MWHEELDOWN → {{ t('apexGameSettings.bindings.jump') }}</span>
              </div>
              <v-alert
                type="warning"
                variant="tonal"
                density="compact"
                class="preset-ping-warning"
                :text="t('apexQuickPreset.pingOpacityDeferred')"
              />
            </div>
          </div>
        </template>
      </v-card-text>

      <v-card-actions>
        <v-spacer/>
        <v-btn variant="text" @click="on_close">{{ t('common.cancel') }}</v-btn>
        <v-btn
          color="primary"
          :loading="apex_store.quick_preset_applying || is_apply_running"
          :disabled="display_loading || !local_display"
          @click="apply_check"
        >
          {{ t('apex.apply') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </div>

  <v-dialog
    v-model="apex_store.tip_dialog"
    content-class="apex-tip-dialog-no-ripple"
  >
    <component
      :is="apex_store.tip_view"
      v-bind="apex_store.tip_props"
      class="not_select"
      @contextmenu.prevent="apex_store.closeTip()"
    />
  </v-dialog>

  <v-dialog v-model="dialog" max-width="400" persistent>
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
        <v-btn color="error" variant="flat" :loading="is_thoroughly_kill" @click="force_close_launcher">
          {{ t('apex.forceClose') }}
        </v-btn>
        <v-spacer/>
        <v-btn variant="text" :disabled="is_thoroughly_kill" @click="cancel">{{ t('common.cancel') }}</v-btn>
      </template>
      <template #append>
        <v-progress-circular indeterminate size="16" color="red" width="2"/>
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

.quick-preset-shell--window,
.quick-preset-card--window {
  height: 100%;
}

.quick-preset-card--window {
  border-radius: 0;
  box-shadow: none;
}

.quick-preset-card--window :deep(.v-card-text) {
  min-height: 0;
  overflow-y: auto;
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
  height: var(--app-control-height-compact);
}

.graphics-preset-toggle :deep(.v-btn-group) {
  flex-wrap: wrap;
}

.graphics-preset-toggle :deep(.v-btn) {
  flex: 1 1 auto;
  padding-inline: 8px;
  font-size: 0.75rem;
  height: var(--app-control-height-compact);
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

.preset-options-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.preset-options-column {
  min-width: 0;
}

.preset-optimization-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(190px, 0.8fr);
  gap: 8px 18px;
}

.preset-binding-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 4px;
}

.preset-ping-warning {
  grid-column: 1 / -1;
}

@media (max-width: 560px) {
  .preset-options-columns {
    grid-template-columns: 1fr;
  }
  .preset-optimization-grid {
    grid-template-columns: 1fr;
  }
  .preset-ping-warning {
    grid-column: auto;
  }
}
</style>
