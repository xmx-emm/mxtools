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
const target_account = computed(() => apex_store.active_apex_account);
const target_account_label = computed(() => {
  const account = target_account.value;
  if (!account) return t('apexQuickPreset.noAccount');
  const platform = account.kind === 'steam' ? 'Steam' : 'EA';
  const identity = account.user.name?.trim() || account.user.id;
  return `${platform} · ${identity}`;
});

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
    if (!key) throw new Error(t('apexQuickPreset.launchLoadFailed'));
    if (apex_store.launch_loaded_for_key !== key
      || apex_store.launch_load_status !== 'ready') {
      await apex_store.load_launch_data({force: true});
    }
    if (apex_store.launch_loaded_for_key !== key
      || apex_store.launch_load_status !== 'ready') {
      throw new Error(t('apexQuickPreset.launchLoadFailed'));
    }
    if (!apex_store.video_config_loaded
      || apex_store.video_config_load_status !== 'ready'
      || Object.keys(apex_store.video_config_values).length === 0) {
      await apex_store.load_apex_video_config({silent: true, force: true});
    }
    if (apex_store.video_config_load_status !== 'ready'
      || Object.keys(apex_store.video_config_values).length === 0) {
      throw new Error(t('apexQuickPreset.videoLoadFailed'));
    }
    if (!apex_store.game_settings_report
      || apex_store.game_settings_load_status !== 'ready') {
      await apex_store.load_apex_game_settings({silent: true, force: true});
    }
    if (!apex_store.game_settings_report) {
      throw new Error(t('apexQuickPreset.gameSettingsLoadFailed'));
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
  if (apex_store.quick_preset_applying) return;
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
    <section class="quick-preset-workbench">
      <v-progress-linear
        v-if="display_loading"
        indeterminate
        color="primary"
        height="3"
        class="quick-preset-progress"
      />
      <v-alert
        v-else-if="display_error"
        type="error"
        density="compact"
        variant="tonal"
        class="quick-preset-state-alert"
        :text="display_error"
      >
        <template #append>
          <v-btn
            class="quick-preset-inline-action"
            variant="text"
            prepend-icon="mdi-refresh"
            @click="load_display_info"
          >
            {{ t('apexQuickPreset.retry') }}
          </v-btn>
        </template>
      </v-alert>

      <main class="quick-preset-scroll">
        <template v-if="local_display">
          <section class="quick-preset-section quick-preset-overview-section">
            <header class="quick-preset-section__header">
              <h2>{{ t('apexQuickPreset.screenInfo') }}</h2>
            </header>
            <dl class="info-grid">
              <div class="info-item">
                <dt class="info-key">{{ t('apexQuickPreset.targetAccount') }}</dt>
                <dd class="info-val">{{ target_account_label }}</dd>
              </div>
              <div class="info-item">
                <dt class="info-key">{{ t('apexQuickPreset.screenSize') }}</dt>
                <dd class="info-val">
                  {{ local_display.width }} &times; {{ local_display.height }}
                </dd>
              </div>
              <div class="info-item">
                <dt class="info-key">{{ t('apexQuickPreset.screenAspect') }}</dt>
                <dd class="info-val">{{ formatAspectRatioLabel(local_display.aspectRatio) }}</dd>
              </div>
              <div class="info-item">
                <dt class="info-key">{{ t('apexQuickPreset.maxRefresh') }}</dt>
                <dd class="info-val">{{ local_display.maxRefreshRate }} Hz</dd>
              </div>
            </dl>
          </section>

          <section class="quick-preset-section">
            <header class="quick-preset-section__header quick-preset-section__header--split">
              <h2>{{ t('apexQuickPreset.fpsCap') }}</h2>
              <span class="quick-preset-range">
                {{ t('apexQuickPreset.fpsCapRange', { min: FPS_CAP_MIN, max: FPS_CAP_MAX }) }}
              </span>
            </header>
            <div class="quick-preset-field-row">
              <ApexNumberInput
                v-model="fps_cap"
                :step="1"
                :min="FPS_CAP_MIN"
                :max="FPS_CAP_MAX"
              />
              <span class="quick-preset-unit">FPS</span>
              <span class="quick-preset-hint">{{ t('apexQuickPreset.lobbyFpsHint') }}</span>
            </div>
          </section>

          <section class="quick-preset-section quick-preset-section--collapsible">
            <header class="quick-preset-section__toggle">
              <v-checkbox
                v-model="enable_resolution_preset"
                :label="t('apexQuickPreset.resolutionAspectSettings')"
                density="compact"
                hide-details
                color="primary"
                class="quick-preset-section-checkbox"
              />
            </header>
            <v-expand-transition>
              <div v-show="enable_resolution_preset" class="quick-preset-section__body">
                <div class="quick-preset-subsection-label">
                  {{ t('apexQuickPreset.aspectPreset') }}
                </div>
                <div class="quick-preset-inline-controls">
                  <v-btn-toggle
                    v-model="lock_axis"
                    mandatory
                    density="compact"
                    color="primary"
                    variant="text"
                    class="apex-parameter-toggle game-page-segmented-toggle"
                    border
                    divided
                  >
                    <v-btn size="small" value="width">{{ t('apexQuickPreset.lockWidth') }}</v-btn>
                    <v-btn size="small" value="height">{{ t('apexQuickPreset.lockHeight') }}</v-btn>
                  </v-btn-toggle>
                </div>
                <div
                  class="quick-preset-segment-scroll"
                  role="region"
                  :aria-label="t('apexQuickPreset.aspectPreset')"
                >
                  <v-btn-toggle
                    v-model="aspect_value"
                    density="compact"
                    color="primary"
                    variant="text"
                    class="apex-parameter-toggle aspect-preset-toggle game-page-segmented-toggle"
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
                  <strong>
                    {{ resolution_preview.width }} &times; {{ resolution_preview.height }}
                  </strong>
                  <span v-if="resolution_preview.fromTable" class="text-medium-emphasis">
                    ({{ t('apexQuickPreset.fromTable') }})
                  </span>
                </div>
              </div>
            </v-expand-transition>
          </section>

          <section class="quick-preset-section quick-preset-section--collapsible">
            <header class="quick-preset-section__toggle">
              <v-checkbox
                v-model="enable_graphics_preset"
                :label="t('apexQuickPreset.graphicsSettingsLabel')"
                density="compact"
                hide-details
                color="primary"
                class="quick-preset-section-checkbox"
              />
            </header>
            <v-expand-transition>
              <div v-show="enable_graphics_preset" class="quick-preset-section__body">
                <div
                  class="quick-preset-segment-scroll"
                  role="region"
                  :aria-label="t('apexQuickPreset.graphicsSettingsLabel')"
                >
                  <v-btn-toggle
                    v-model="graphics_preset_id"
                    mandatory
                    density="compact"
                    color="primary"
                    variant="text"
                    class="apex-parameter-toggle graphics-preset-toggle game-page-segmented-toggle"
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
                </div>
                <div
                  v-if="graphicsQualityPresets.find((p) => p.identifier === graphics_preset_id)?.description"
                  class="text-caption text-medium-emphasis"
                >
                  {{ t(graphicsQualityPresets.find((p) => p.identifier === graphics_preset_id)!.description!) }}
                </div>
              </div>
            </v-expand-transition>
          </section>

          <section class="quick-preset-section quick-preset-options-section">
            <div class="preset-options-columns">
              <section class="preset-options-column">
                <header class="quick-preset-group-header">
                  <h2>{{ t('apexQuickPreset.launchOptionsLabel') }}</h2>
                </header>
                <div class="quick-preset-option-list">
                  <div
                    v-for="opt in quickPresetLaunchOptionToggles"
                    :key="opt.key"
                    class="option-tip-wrap game-page-row-tip-host"
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
                    <v-btn
                      icon="mdi-information-variant"
                      density="compact"
                      variant="text"
                      class="mx-compact-icon-button game-page-row-tip-button"
                      :aria-label="t('apexGameSettings.openTip', {setting: t(opt.label)})"
                      @click.stop="show_launch_option_tip(opt)"
                    />
                  </div>
                  <div
                    class="option-tip-wrap game-page-row-tip-host"
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
                    <v-btn
                      icon="mdi-information-variant"
                      density="compact"
                      variant="text"
                      class="mx-compact-icon-button game-page-row-tip-button"
                      :aria-label="t('apexGameSettings.openTip', {setting: t('apexQuickPreset.simplifiedReticle')})"
                      @click.stop="show_reticle_tip()"
                    />
                  </div>
                </div>
              </section>

              <section class="preset-options-column">
                <header class="quick-preset-group-header">
                  <h2>{{ t('apexQuickPreset.videoConfigLabel') }}</h2>
                </header>
                <div class="quick-preset-option-list">
                  <div
                    v-for="opt in quickPresetVideoConfigToggles"
                    :key="opt.key"
                    class="option-tip-wrap game-page-row-tip-host"
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
                    <v-btn
                      icon="mdi-information-variant"
                      density="compact"
                      variant="text"
                      class="mx-compact-icon-button game-page-row-tip-button"
                      :aria-label="t('apexGameSettings.openTip', {setting: t(opt.label)})"
                      @click.stop="show_video_option_tip(opt)"
                    />
                  </div>
                </div>
              </section>
            </div>
          </section>

          <section class="quick-preset-section quick-preset-optimizations-section">
            <header class="quick-preset-section__header">
              <h2>{{ t('apexQuickPreset.gameOptimizationsLabel') }}</h2>
            </header>
            <div class="preset-optimization-grid">
              <div class="quick-preset-option-list">
                <div
                  v-for="opt in quickPresetGameSettingToggles"
                  :key="opt[0]"
                  class="option-tip-wrap game-page-row-tip-host"
                  :title="t('apexLaunchOptions.ui.rightClickTip')"
                  @contextmenu.prevent="show_game_setting_tip(opt[0])"
                >
                  <v-checkbox
                    v-model="game_setting_options[opt[0]]"
                    :label="t(`apexQuickPreset.optimizations.${opt[3]}`)"
                    density="compact"
                    hide-details
                    color="primary"
                    class="compact-checkbox"
                  />
                  <v-btn
                    icon="mdi-information-variant"
                    density="compact"
                    variant="text"
                    class="mx-compact-icon-button game-page-row-tip-button"
                    :aria-label="t('apexGameSettings.openTip', {setting: t(`apexGameSettings.fields.${opt[0]}.name`)})"
                    @click.stop="show_game_setting_tip(opt[0])"
                  />
                </div>
              </div>
              <aside class="preset-binding-summary">
                <strong>{{ t('apexQuickPreset.bindingOptimizationsLabel') }}</strong>
                <span>MOUSE2 &rarr; {{ t('apexGameSettings.bindings.holdAim') }}</span>
                <span>MWHEELUP &rarr; {{ t('apexGameSettings.bindings.moveForward') }}</span>
                <span>MWHEELDOWN &rarr; {{ t('apexGameSettings.bindings.jump') }}</span>
              </aside>
            </div>
            <v-alert
              type="warning"
              variant="tonal"
              density="compact"
              class="preset-ping-warning"
              :text="t('apexQuickPreset.pingOpacityDeferred')"
            />
          </section>
        </template>
      </main>

      <footer class="quick-preset-footer">
        <v-btn
          class="quick-preset-action"
          variant="text"
          prepend-icon="mdi-close"
          :disabled="apex_store.quick_preset_applying"
          @click="on_close"
        >{{ t('common.cancel') }}</v-btn>
        <v-btn
          class="quick-preset-action"
          color="primary"
          variant="flat"
          prepend-icon="mdi-check"
          :loading="apex_store.quick_preset_applying || is_apply_running"
          :disabled="display_loading || !local_display"
          @click="apply_check"
        >
          {{ t('apex.apply') }}
        </v-btn>
      </footer>
    </section>
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
      class="quick-preset-dialog"
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
        <v-btn
          class="quick-preset-action"
          color="error"
          variant="flat"
          prepend-icon="mdi-close"
          :loading="is_thoroughly_kill"
          @click="force_close_launcher"
        >
          {{ t('apex.forceClose') }}
        </v-btn>
        <v-spacer/>
        <v-btn
          class="quick-preset-action"
          variant="text"
          :disabled="is_thoroughly_kill"
          @click="cancel"
        >
          {{ t('common.cancel') }}
        </v-btn>
      </template>
      <template #append>
        <v-progress-circular indeterminate size="16" color="red" width="2"/>
      </template>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.quick-preset-shell--window {
  height: 100%;
}

.quick-preset-workbench {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.9);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-layer-raised);
  letter-spacing: 0;
}

.quick-preset-progress {
  flex: 0 0 auto;
}

.quick-preset-state-alert {
  flex: 0 0 auto;
  margin: 0 !important;
  border-radius: 0 !important;
  border-bottom: 1px solid var(--app-border);
  font-size: 11px;
  line-height: 1.5;
}

.quick-preset-inline-action.v-btn {
  min-height: var(--app-control-height-compact) !important;
  height: var(--app-control-height-compact) !important;
  padding-inline: 8px !important;
  border-radius: var(--app-radius-sm) !important;
  letter-spacing: 0;
  text-transform: none;
}

.quick-preset-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.quick-preset-section {
  min-width: 0;
  padding: 12px 14px;
}

.quick-preset-section + .quick-preset-section {
  border-top: 1px solid var(--app-border);
}

.quick-preset-section__header,
.quick-preset-group-header {
  display: flex;
  align-items: center;
  min-width: 0;
  margin-bottom: 8px;
}

.quick-preset-section__header--split {
  justify-content: space-between;
  gap: 12px;
}

.quick-preset-section h2,
.quick-preset-group-header h2 {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.86);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.quick-preset-section--collapsible {
  padding: 0;
}

.quick-preset-section__toggle {
  min-height: 44px;
  padding: 6px 14px;
}

.quick-preset-section-checkbox {
  width: 100%;
}

.quick-preset-section-checkbox :deep(.v-selection-control) {
  min-height: var(--app-control-height-compact);
}

.quick-preset-section-checkbox :deep(.v-label) {
  color: rgba(var(--v-theme-on-surface), 0.84);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.4;
}

.quick-preset-section__body {
  min-width: 0;
  padding: 0 14px 12px;
  border-top: 1px solid var(--app-border);
}

.quick-preset-subsection-label {
  margin-bottom: 7px;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
}

.quick-preset-inline-controls {
  display: flex;
  min-width: 0;
  margin-bottom: 8px;
}

.info-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) repeat(3, minmax(0, 1fr));
  margin: 0;
}

.info-item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  padding: 3px 10px;
  border-left: 1px solid var(--app-border);
}

.info-item:first-child {
  padding-left: 0;
  border-left: 0;
}

.info-key {
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 10px;
  line-height: 1.4;
}

.info-val {
  margin: 0;
  min-width: 0;
  color: rgba(var(--v-theme-on-surface), 0.86);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.quick-preset-field-row {
  display: flex;
  align-items: center;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
}

.quick-preset-unit,
.quick-preset-range,
.quick-preset-hint {
  font-size: 11px;
  line-height: 1.45;
}

.quick-preset-unit {
  color: rgba(var(--v-theme-on-surface), 0.75);
  font-weight: 650;
}

.quick-preset-range,
.quick-preset-hint {
  color: rgba(var(--v-theme-on-surface), 0.52);
}

.quick-preset-hint {
  min-width: min(100%, 220px);
  flex: 1 1 220px;
}

.apex-parameter-toggle {
  min-width: 0;
  max-width: 100%;
}

.quick-preset-segment-scroll {
  max-width: 100%;
  min-width: 0;
  margin-bottom: 7px;
  padding-bottom: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-color: rgba(var(--v-theme-on-surface), 0.22) transparent;
  scrollbar-width: thin;
}

.quick-preset-segment-scroll::-webkit-scrollbar {
  height: 4px;
}

.quick-preset-segment-scroll::-webkit-scrollbar-thumb {
  border-radius: 2px;
  background: rgba(var(--v-theme-on-surface), 0.22);
}

.quick-preset-segment-scroll > .apex-parameter-toggle {
  width: max-content;
  min-width: max-content;
  max-width: none;
  flex-wrap: nowrap !important;
}

.aspect-preset-toggle :deep(.v-btn),
.graphics-preset-toggle :deep(.v-btn) {
  min-width: max-content;
  flex: 0 0 auto;
  white-space: nowrap;
}

.quick-preset-section__body > .text-caption {
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 11px !important;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.compact-checkbox {
  flex: 1 1 auto;
  min-width: 0;
}

.compact-checkbox :deep(.v-selection-control) {
  min-height: var(--app-control-height-compact);
}

.compact-checkbox :deep(.v-label) {
  min-width: 0;
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.option-tip-wrap {
  display: flex;
  align-items: center;
  min-width: 0;
  min-height: 34px;
  padding-left: 2px;
  border-top: 1px solid var(--app-border);
  cursor: default;
  transition: background-color var(--app-motion-fast) var(--app-ease-standard);
}

.quick-preset-option-list .option-tip-wrap:first-child {
  border-top: 0;
}

.preset-options-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0;
}

.preset-options-column {
  min-width: 0;
}

.preset-options-column + .preset-options-column {
  margin-left: 14px;
  padding-left: 14px;
  border-left: 1px solid var(--app-border);
}

.quick-preset-group-header {
  margin-bottom: 4px;
}

.preset-optimization-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(190px, 0.72fr);
  gap: 16px;
}

.preset-binding-summary {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-self: start;
  gap: 4px;
  padding: 4px 0 4px 14px;
  color: rgba(var(--v-theme-on-surface), 0.56);
  border-left: 1px solid var(--app-border);
  font-size: 11px;
  line-height: 1.45;
}

.preset-binding-summary strong {
  margin-bottom: 2px;
  color: rgba(var(--v-theme-on-surface), 0.76);
  font-size: 12px;
  font-weight: 650;
  overflow-wrap: anywhere;
}

.preset-binding-summary span {
  overflow-wrap: anywhere;
}

.preset-ping-warning {
  margin-top: 10px;
  border-radius: var(--app-radius-sm);
  font-size: 11px;
  line-height: 1.5;
}

.quick-preset-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
  min-height: 56px;
  gap: 6px;
  padding: 9px 14px;
  border-top: 1px solid var(--app-border);
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.quick-preset-action.v-btn {
  min-height: var(--app-control-height-action) !important;
  height: var(--app-control-height-action) !important;
  padding-inline: 11px !important;
  border-radius: var(--app-radius-sm) !important;
  letter-spacing: 0;
  text-transform: none;
}

.quick-preset-dialog.v-card {
  border-radius: var(--app-radius-md);
}

.quick-preset-dialog :deep(.v-card-title) {
  font-size: 15px;
  font-weight: 680;
  line-height: 1.4;
}

.quick-preset-dialog :deep(.v-card-text) {
  font-size: 12px;
  line-height: 1.55;
}

@media (hover: hover) {
  .option-tip-wrap:hover {
    background: var(--app-hover);
  }
}

@media (max-width: 680px) {
  .info-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .info-item:nth-child(odd) {
    padding-left: 0;
    border-left: 0;
  }

  .info-item:nth-child(n + 3) {
    margin-top: 7px;
    padding-top: 7px;
    border-top: 1px solid var(--app-border);
  }

  .preset-options-columns {
    grid-template-columns: 1fr;
  }

  .preset-options-column + .preset-options-column {
    margin-top: 12px;
    margin-left: 0;
    padding-top: 12px;
    padding-left: 0;
    border-top: 1px solid var(--app-border);
    border-left: 0;
  }

  .preset-optimization-grid {
    grid-template-columns: 1fr;
  }

  .preset-binding-summary {
    padding: 12px 0 0;
    border-top: 1px solid var(--app-border);
    border-left: 0;
  }
}

@media (max-width: 480px) {
  .quick-preset-section,
  .quick-preset-section__toggle {
    padding-inline: 12px;
  }

  .quick-preset-section__body {
    padding-inline: 12px;
  }

  .quick-preset-section__header--split {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .info-item,
  .info-item:nth-child(odd) {
    padding: 7px 0;
    border-top: 1px solid var(--app-border);
    border-left: 0;
  }

  .info-item:first-child {
    padding-top: 0;
    border-top: 0;
  }

  .quick-preset-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .quick-preset-footer .v-btn {
    width: 100%;
  }
}
</style>
