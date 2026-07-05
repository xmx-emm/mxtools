<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexLauncherUser from '@/components/game/apex/ApexLauncherUser.vue';
import eaStore from '@/stores/game/ea.ts';
import steamStore from '@/stores/game/steam.ts';
import {onMounted, onUnmounted, ref, watch, computed} from 'vue';
import {useToast} from 'vue-toastification';
import {openApexVideoConfigFolder, openConfigFileFolder} from '@/utils/open-folder.ts';
import ApexApply from '@/components/game/apex/launch/ApexApply.vue';
import ApexStart from '@/components/game/apex/launch/ApexStart.vue';
import ApexApexCopyButton from '@/components/game/apex/launch/ApexCopyButton.vue';
import ApexSelectLaunchOptions from '@/components/game/apex/launch/ApexSelectLaunchOptions.vue';
import ApexSteamManualDownloadMilesLanguage
  from '@/components/game/apex/launch/language/steam/ApexManualDownloadMilesLanguage.vue';
import ApexEaManualDownloadMilesLanguage from '@/components/game/apex/launch/language/ea/ApexManualDownloadMilesLanguage.vue';
import ApexSemiAutomaticDownloadLanguage
  from '@/components/game/apex/launch/language/steam/ApexSemiAutomaticDownloadLanguage.vue';
import ApexVideoConfig from '@/components/game/apex/video_config/ApexVideoConfig.vue';
import ApexVideoConfigApply from '@/components/game/apex/video_config/ApexVideoConfigApply.vue';
import ApexQuickPresetDialog from '@/components/game/apex/preset/ApexQuickPresetDialog.vue';
import GameRefreshIconButton from '@/components/game/common/GameRefreshIconButton.vue';
import apexStore from '@/stores/game/apex.ts';
import {ApexPageTypeEnum} from '@/enum.ts';
import {registerHmrCleanup} from '@/utils/hmr.ts';
import {startTauriStoreOnce} from '@/utils/tauri_store.ts';

const { t } = useI18n();
const toast = useToast();
const steam_store = steamStore();
const { check_is_steam_running, refresh_users } = steam_store;
const ea_store = eaStore();
const apex_store = apexStore();

const is_content_loading = computed(() =>
  apex_store.is_accounts_loading
  || (apex_store.is_launch_page
    ? apex_store.is_start_loading
    : apex_store.is_video_config_loading),
);

const visited_launch_tab = ref(true);
const visited_video_tab = ref(false);
const launch_refresh_loading = ref(false);
const video_refresh_loading = ref(false);
let page_bootstrapped = false;

async function refresh_running_for_active_account() {
  const acc = apex_store.active_apex_account;
  if (!acc) return;
  if (acc.kind === 'steam') {
    await check_is_steam_running();
  } else {
    await ea_store.check_is_ea_desktop_running();
  }
}

function on_visibility_change() {
  if (document.visibilityState === 'visible' && apex_store.active_apex_account) {
    void refresh_running_for_active_account();
  }
}

onMounted(async () => {
  await startTauriStoreOnce('apex', () => apex_store.$tauri.start());
  await refresh_users();
  await apex_store.refresh_apex_accounts();
  if (apex_store.is_video_config_page) {
    visited_video_tab.value = true;
    apex_store.start_video_config();
  } else {
    apex_store.start_launch();
  }
  await refresh_running_for_active_account();
  window.addEventListener('visibilitychange', on_visibility_change);
  page_bootstrapped = true;
  if (import.meta.env.DEV) {
    registerHmrCleanup(() => {
      window.removeEventListener('visibilitychange', on_visibility_change);
    });
  }
});

watch(
  () => apex_store.launcher_selection_key,
  async (key, prevKey) => {
    if (!page_bootstrapped || prevKey == null || key === prevKey) return;
    await refresh_running_for_active_account();
    if (apex_store.is_launch_page) {
      apex_store.start_launch();
    } else {
      apex_store.start_video_config(true);
    }
  },
);

watch(
  () => apex_store.page_type,
  (page, prev) => {
    if (!page_bootstrapped || prev === undefined) return;
    if (page === ApexPageTypeEnum.video_config) {
      visited_video_tab.value = true;
      apex_store.start_video_config();
    } else {
      visited_launch_tab.value = true;
      apex_store.start_launch();
    }
  },
);

onUnmounted(() => {
  window.removeEventListener('visibilitychange', on_visibility_change);
});

async function reload_apex_launch_options() {
  if (launch_refresh_loading.value) return;
  launch_refresh_loading.value = true;
  try {
    await apex_store.reload_launch_page();
  } finally {
    launch_refresh_loading.value = false;
  }
}

async function reload_apex_video_config() {
  if (video_refresh_loading.value) return;
  video_refresh_loading.value = true;
  try {
    await apex_store.load_apex_video_config();
  } finally {
    video_refresh_loading.value = false;
  }
}

async function open_launch_config_folder() {
  const acc = apex_store.active_apex_account;
  if (!acc) {
    toast.warning(t('apex.noLauncherAccount'));
    return;
  }
  try {
    await openConfigFileFolder(acc.user.config_path);
  } catch (e) {
    if (String(e).includes('NO_CONFIG_PATH')) {
      toast.warning(t('apex.noLauncherAccount'));
    } else {
      toast.error(String(e));
    }
  }
}

async function open_video_config_folder() {
  try {
    await openApexVideoConfigFolder();
  } catch (e) {
    toast.error(String(e));
  }
}

function on_page_type_change(value: ApexPageTypeEnum | null) {
  if (value != null) {
    apex_store.set_page_type(value);
  }
}

function open_quick_preset() {
  apex_store.open_quick_preset_dialog();
}
</script>
<template>
  <v-col cols="12" class="page-content game-page-layout d-flex flex-column h-100 w-100 position-relative">
    <v-overlay
      :model-value="is_content_loading"
      contained
      persistent
      class="align-center justify-center"
      scrim="rgba(0,0,0,0.25)"
    >
      <v-progress-circular indeterminate color="primary" />
    </v-overlay>
    <div class="apex-page-toolbar game-page-toolbar">
      <ApexLauncherUser
        class="apex-page-toolbar-user"
        @update_user="apex_store.is_launch_page ? apex_store.start_launch() : apex_store.start_video_config()"
      />
      <div class="apex-page-toolbar-controls">
        <div class="apex-toolbar-control-slot">
          <v-btn
            size="small"
            variant="text"
            density="compact"
            class="apex-preset-btn"
            :title="t('apex.pagePresetTip')"
            @click="open_quick_preset"
          >
            <v-icon icon="mdi-lightning-bolt-outline" size="small" />
          </v-btn>
        </div>
        <div class="apex-toolbar-control-slot">
          <v-btn-toggle
            :model-value="apex_store.page_type"
            @update:model-value="on_page_type_change"
            class="apex-page-type-toggle game-page-segmented-toggle"
            mandatory
            divided
            density="compact"
            variant="text"
            :disabled="is_content_loading"
          >
            <v-btn
              size="small"
              :value="ApexPageTypeEnum.launch"
              :title="t('apex.pageLaunch')"
              prepend-icon="mdi-rocket-launch-outline"
            >
              {{ t('apex.pageLaunch') }}
            </v-btn>
            <v-btn
              size="small"
              :value="ApexPageTypeEnum.video_config"
              :title="t('apex.pageVideoConfig')"
              prepend-icon="mdi-tune-variant"
            >
              {{ t('apex.pageVideoConfig') }}
            </v-btn>
          </v-btn-toggle>
        </div>
      </div>
    </div>

    <div class="game-page-gap"/>

    <div class="game-page-main" style="flex:1;min-height:0;display:flex">
      <ApexSelectLaunchOptions
        v-if="apex_store.is_launch_page"
        style="flex:1;min-height:0;"/>
      <ApexVideoConfig
        v-else-if="visited_video_tab"
        style="flex:1;min-height:0;"/>
    </div>

    <div class="game-page-gap"/>

    <div class="game-page-actions">
      <template v-if="apex_store.is_launch_page">
        <v-btn-group density="compact" divided>
          <ApexApexCopyButton/>
          <GameRefreshIconButton
            :loading="launch_refresh_loading"
            :title="`${t('apex.reloadLaunchOptions')} · ${t('common.rightClickOpenConfigFolder')}`"
            @click="reload_apex_launch_options"
            @contextmenu="open_launch_config_folder"
          />
        </v-btn-group>
        <v-spacer></v-spacer>
        <v-btn-group density="compact" divided>
          <ApexStart/>
          <ApexApply/>
        </v-btn-group>
      </template>
      <template v-else>
        <v-btn-group density="compact" divided>
          <GameRefreshIconButton
            :loading="video_refresh_loading"
            :title="`${t('apex.reloadVideoConfig')} · ${t('common.rightClickOpenConfigFolder')}`"
            @click="reload_apex_video_config"
            @contextmenu="open_video_config_folder"
          />
        </v-btn-group>
        <v-spacer></v-spacer>
        <v-btn-group density="compact" divided>
          <ApexStart/>
          <ApexVideoConfigApply/>
        </v-btn-group>
      </template>
    </div>

    <v-dialog
      v-model="apex_store.tip_dialog"
      content-class="apex-tip-dialog-no-ripple"
    >
      <component
        :is="apex_store.tip_view"
        class="not_select"
        @contextmenu.prevent="apex_store.closeTip()"
      />
    </v-dialog>
    <ApexSteamManualDownloadMilesLanguage v-if="apex_store.download_miles_language_manual_dialog"/>
    <ApexEaManualDownloadMilesLanguage v-if="apex_store.download_miles_language_manual_dialog_ea"/>
    <ApexSemiAutomaticDownloadLanguage v-if="apex_store.download_miles_language_semi_automatic_dialog"/>
    <ApexQuickPresetDialog v-if="apex_store.quick_preset_dialog"/>
  </v-col>
</template>
<style scoped>
.apex-page-toolbar {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.apex-page-toolbar-user {
  flex: 1 1 auto;
  min-width: 0;
}

.apex-page-toolbar-controls {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: auto;
}

.apex-toolbar-control-slot {
  display: flex;
  align-items: center;
  height: var(--game-page-control-height);
}

.apex-toolbar-control-slot :deep(.v-btn-toggle),
.apex-toolbar-control-slot :deep(.v-btn-group) {
  height: var(--game-page-control-height);
}

.apex-preset-btn {
  min-width: var(--game-page-control-height) !important;
  width: var(--game-page-control-height) !important;
  max-width: var(--game-page-control-height) !important;
  min-height: var(--game-page-control-height) !important;
  height: var(--game-page-control-height) !important;
  padding-inline: 0 !important;
  margin: 0 !important;
  color: rgba(var(--v-theme-on-surface), 0.55) !important;
}

.apex-preset-btn :deep(.v-btn__content) {
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.apex-preset-btn :deep(.v-icon) {
  font-size: 16px;
}

.apex-page-type-toggle {
  flex-shrink: 0;
}

.apex-page-type-toggle :deep(.v-btn) {
  min-height: var(--game-page-control-height) !important;
  height: var(--game-page-control-height) !important;
  color: rgba(var(--v-theme-on-surface), 0.55) !important;
  background: transparent !important;
}

.apex-page-type-toggle :deep(.v-btn--active) {
  color: rgb(var(--v-theme-on-primary-container)) !important;
  background: rgb(var(--v-theme-primary-container)) !important;
}

.apex-page-type-toggle :deep(.v-btn--active > .v-btn__overlay) {
  opacity: 0 !important;
}

.apex-page-type-toggle :deep(.v-btn--active .v-icon) {
  color: rgb(var(--v-theme-on-primary-container)) !important;
}

.apex-page-type-toggle :deep(.v-btn__prepend) {
  margin-inline: 2px 6px;
}

.apex-page-type-toggle :deep(.v-btn__prepend .v-icon) {
  font-size: 16px;
}

.apex-page-type-toggle :deep(.v-btn__content) {
  padding-inline: 2px;
}

.apex-tab-panel {
  display: none;
}

.apex-tab-panel--active {
  display: flex;
}
</style>

<style>
.apex-tip-dialog-no-ripple .v-ripple__container {
  display: none !important;
}
</style>
