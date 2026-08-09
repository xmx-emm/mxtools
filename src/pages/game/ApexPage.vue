<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import ApexLauncherUser from '@/components/game/apex/ApexLauncherUser.vue';
import {useEaStore} from '@/stores/game/ea.ts';
import {useSteamStore} from '@/stores/game/steam.ts';
import {onMounted, onUnmounted, ref, watch, computed} from 'vue';
import {useToast} from 'vue-toastification';
import {openApexVideoConfigFolder, openConfigFileFolder, openFolderDetached, parentDirOfFile} from '@/utils/open-folder.ts';
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
import ApexGameSettings from '@/components/game/apex/settings/ApexGameSettings.vue';
import ApexGameSettingsApply from '@/components/game/apex/settings/ApexGameSettingsApply.vue';
import ApexConfigExportDialog from '@/components/game/apex/preset/ApexConfigExportDialog.vue';
import ApexConfigImportDialog from '@/components/game/apex/preset/ApexConfigImportDialog.vue';
import ApexConfigHistoryDialog from '@/components/game/apex/history/ApexConfigHistoryDialog.vue';
import ApexResetDefaultsDialog from '@/components/game/apex/history/ApexResetDefaultsDialog.vue';
import {openApexQWindow, openRepairToolWindow} from '@/utils/windows.ts';
import GameRefreshIconButton from '@/components/game/common/GameRefreshIconButton.vue';
import {useApexStore} from '@/stores/game/apex.ts';
import {useSettingsStore} from '@/stores/settings.ts';
import {ApexPageTypeEnum} from '@/enum.ts';
import {registerHmrCleanup} from '@/utils/hmr.ts';
import {startTauriStoreOnce} from '@/utils/tauri_store.ts';
import {open} from '@tauri-apps/plugin-dialog';
import {apexIsRunning, explorerFolder, readUtf8File} from '@/ipc/commands.ts';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {
  ApexConfigSnapshotParseError,
  parseApexConfigSnapshot,
} from '@/utils/game/apex_config_snapshot.ts';
import {
  listenApexConfigChanged,
  markApexConfigChangeSeen,
  pendingApexConfigChange,
  type ApexExternalConfigScope,
} from '@/utils/game/apex_config_events.ts';

type TauriRuntimeWindow = Window & {__TAURI_INTERNALS__?: unknown};
const isTauriRuntime = typeof window !== 'undefined'
  && Boolean((window as TauriRuntimeWindow).__TAURI_INTERNALS__);

const { t } = useI18n();
const toast = useToast();
const steam_store = useSteamStore();
const { check_is_steam_running } = steam_store;
const ea_store = useEaStore();
const apex_store = useApexStore();
const settings_store = useSettingsStore();

const is_initial_content_loading = computed(() => {
  if (apex_store.is_launch_page) {
    return apex_store.is_start_loading
      && apex_store.launch_loaded_for_key !== apex_store.launcher_selection_key;
  }
  if (apex_store.is_video_config_page) {
    return apex_store.is_video_config_loading && !apex_store.video_config_loaded;
  }
  return apex_store.is_game_settings_loading && !apex_store.game_settings_loaded;
});
const is_waiting_for_game_defaults = computed(() => (
  (apex_store.is_video_config_page && apex_store.reset_pending_scopes.includes('video'))
  || (apex_store.is_game_settings_page && apex_store.reset_pending_scopes.includes('gameSettings'))
));

const visited_launch_tab = ref(true);
const visited_video_tab = ref(false);
const visited_game_settings_tab = ref(false);
const launch_refresh_loading = ref(false);
const video_refresh_loading = ref(false);
const game_settings_refresh_loading = ref(false);
let page_bootstrapped = false;
let unlisten_window_focus: (() => void) | null = null;
let unlisten_config_changed: (() => void) | null = null;
let external_config_refresh: Promise<void> | null = null;
const pending_external_scopes = new Set<ApexExternalConfigScope>();
const pending_defaults_refreshing = ref(false);

async function refresh_external_config(scopes: ApexExternalConfigScope[]) {
  if (!isTauriRuntime) return;
  for (const scope of scopes) pending_external_scopes.add(scope);
  if (external_config_refresh) return external_config_refresh;
  external_config_refresh = (async () => {
    while (pending_external_scopes.size > 0) {
      const selected = new Set(pending_external_scopes);
      pending_external_scopes.clear();
      const requests: Promise<unknown>[] = [];
      if (selected.has('launch') && apex_store.active_apex_account) {
        requests.push(apex_store.reload_launch_page());
      }
      if (selected.has('video')) {
        requests.push(apex_store.load_apex_video_config({silent: true, force: true}));
      }
      if (selected.has('gameSettings')) {
        requests.push(apex_store.load_apex_game_settings({
          silent: true,
          force: true,
          discardLocal: true,
        }));
      }
      await Promise.all(requests);
      const failed: ApexExternalConfigScope[] = [];
      if (selected.has('launch') && apex_store.active_apex_account
        && (apex_store.launch_load_status !== 'ready'
          || apex_store.launch_loaded_for_key !== apex_store.launcher_selection_key)) {
        failed.push('launch');
      }
      if (selected.has('video')
        && (apex_store.video_config_load_status !== 'ready'
          || !apex_store.video_config_loaded)) {
        failed.push('video');
      }
      if (selected.has('gameSettings')
        && (apex_store.game_settings_load_status !== 'ready'
          || !apex_store.game_settings_loaded
          || !apex_store.game_settings_report)) {
        failed.push('gameSettings');
      }
      if (failed.length > 0) {
        throw new Error(`Apex external configuration refresh failed: ${failed.join(', ')}`);
      }
    }
  })().finally(() => {
    external_config_refresh = null;
    if (pending_external_scopes.size > 0) {
      void refresh_external_config([]);
    }
  });
  return external_config_refresh;
}

async function refresh_pending_external_config() {
  const pendingChange = pendingApexConfigChange();
  if (!pendingChange) return;
  try {
    await refresh_external_config(pendingChange.scopes);
    markApexConfigChangeSeen(pendingChange.revision);
  } catch (error) {
    console.warn('refresh pending Apex configuration failed', error);
  }
}

async function refresh_running_for_active_account() {
  if (!isTauriRuntime) return;
  const acc = apex_store.active_apex_account;
  if (!acc) return;
  if (acc.kind === 'steam') {
    await check_is_steam_running();
  } else {
    await ea_store.check_is_ea_desktop_running();
  }
}

async function refresh_pending_defaults() {
  if (!isTauriRuntime) return;
  if (!apex_store.reset_pending_scopes.length || pending_defaults_refreshing.value) return;
  pending_defaults_refreshing.value = true;
  try {
    if (await apexIsRunning().catch(() => true)) return;
    const requests: Promise<void>[] = [];
    if (apex_store.reset_pending_scopes.includes('video')) {
      requests.push(apex_store.load_apex_video_config({silent: true, force: true}));
    }
    if (apex_store.reset_pending_scopes.includes('gameSettings')) {
      requests.push(apex_store.load_apex_game_settings({silent: true, force: true}));
    }
    await Promise.all(requests);
  } finally {
    pending_defaults_refreshing.value = false;
  }
}

function on_app_focus() {
  if (apex_store.active_apex_account) {
    void refresh_running_for_active_account();
  }
  void refresh_pending_defaults();
  void refresh_pending_external_config();
}

function on_visibility_change() {
  if (document.visibilityState === 'visible' && apex_store.active_apex_account) {
    on_app_focus();
  }
}

onMounted(async () => {
  if (!isTauriRuntime) {
    page_bootstrapped = true;
    if (apex_store.is_video_config_page) visited_video_tab.value = true;
    if (apex_store.is_game_settings_page) visited_game_settings_tab.value = true;
    return;
  }
  await startTauriStoreOnce('apex', () => apex_store.$tauri.start());
  unlisten_config_changed = await listenApexConfigChanged(async ({scopes, revision}) => {
    try {
      await refresh_external_config(scopes);
      markApexConfigChangeSeen(revision);
    } catch (error) {
      console.warn('refresh live Apex configuration failed', error);
    }
  });
  page_bootstrapped = true;
  if (apex_store.is_video_config_page) visited_video_tab.value = true;
  if (apex_store.is_game_settings_page) visited_game_settings_tab.value = true;

  if (apex_store.accounts_loaded) {
    if (apex_store.is_video_config_page) apex_store.start_video_config();
    else if (apex_store.is_game_settings_page) apex_store.start_game_settings();
    else apex_store.start_launch();
  }

  await apex_store.refresh_apex_accounts({silent: apex_store.accounts_loaded});
  if (apex_store.is_video_config_page) {
    visited_video_tab.value = true;
    apex_store.start_video_config();
  } else if (apex_store.is_game_settings_page) {
    visited_game_settings_tab.value = true;
    apex_store.start_game_settings();
  } else {
    apex_store.start_launch();
  }
  await refresh_running_for_active_account();
  await refresh_pending_external_config();
  document.addEventListener('visibilitychange', on_visibility_change);
  unlisten_window_focus = await getCurrentWindow().onFocusChanged(({payload}) => {
    if (payload) on_app_focus();
  });
  void refresh_pending_defaults();
  if (import.meta.env.DEV) {
    registerHmrCleanup(() => {
      document.removeEventListener('visibilitychange', on_visibility_change);
      unlisten_window_focus?.();
      unlisten_window_focus = null;
      unlisten_config_changed?.();
      unlisten_config_changed = null;
    });
  }
});

watch(
  () => apex_store.launcher_selection_key,
  async (key, prevKey) => {
    if (!isTauriRuntime || !page_bootstrapped || prevKey == null || key === prevKey) return;
    await refresh_running_for_active_account();
    if (apex_store.is_launch_page) {
      apex_store.start_launch();
    }
  },
);

watch(
  () => apex_store.page_type,
  (page, prev) => {
    if (!page_bootstrapped || prev === undefined) return;
    if (page === ApexPageTypeEnum.video_config) {
      visited_video_tab.value = true;
      if (isTauriRuntime) apex_store.start_video_config();
    } else if (page === ApexPageTypeEnum.game_settings) {
      visited_game_settings_tab.value = true;
      if (isTauriRuntime) apex_store.start_game_settings();
    } else {
      visited_launch_tab.value = true;
      if (isTauriRuntime) apex_store.start_launch();
    }
  },
);

onUnmounted(() => {
  document.removeEventListener('visibilitychange', on_visibility_change);
  unlisten_window_focus?.();
  unlisten_window_focus = null;
  unlisten_config_changed?.();
  unlisten_config_changed = null;
});

async function reload_apex_launch_options() {
  if (!isTauriRuntime) return;
  if (launch_refresh_loading.value) return;
  launch_refresh_loading.value = true;
  try {
    await apex_store.reload_launch_page();
  } finally {
    launch_refresh_loading.value = false;
  }
}

async function reload_apex_video_config() {
  if (!isTauriRuntime) return;
  if (video_refresh_loading.value) return;
  video_refresh_loading.value = true;
  try {
    await apex_store.load_apex_video_config({force: true});
  } finally {
    video_refresh_loading.value = false;
  }
}

async function reload_apex_game_settings() {
  if (!isTauriRuntime) return;
  if (game_settings_refresh_loading.value) return;
  game_settings_refresh_loading.value = true;
  try {
    await apex_store.load_apex_game_settings({force: true});
  } finally {
    game_settings_refresh_loading.value = false;
  }
}

async function open_launch_config_folder() {
  if (!isTauriRuntime) return;
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
  if (!isTauriRuntime) return;
  try {
    await openApexVideoConfigFolder();
  } catch (e) {
    toast.error(String(e));
  }
}

async function open_game_settings_folder() {
  if (!isTauriRuntime) return;
  const path = apex_store.game_settings_report?.settings.path;
  if (!path) return;
  try {
    await openFolderDetached(parentDirOfFile(path));
  } catch (e) {
    toast.error(String(e));
  }
}

function on_page_type_change(value: ApexPageTypeEnum | null) {
  if (value != null) {
    apex_store.set_page_type(value);
  }
}

function on_user_update() {
  if (!isTauriRuntime) return;
  if (apex_store.is_launch_page) apex_store.start_launch();
  else if (apex_store.is_video_config_page) apex_store.start_video_config();
  else apex_store.start_game_settings();
}

function open_quick_preset() {
  if (!isTauriRuntime) return;
  apex_store.open_quick_preset_window();
}

function open_launch_repair() {
  if (!isTauriRuntime) return;
  void openRepairToolWindow('apex-launch', apex_store.launcher_selection_key)
    .catch((error) => toast.error(String(error)));
}

function open_apex_q() {
  if (!isTauriRuntime) return;
  void openApexQWindow().catch((error) => toast.error(String(error)));
}

function open_config_export() {
  apex_store.open_config_export_dialog();
}

async function open_config_import() {
  if (!isTauriRuntime) return;
  try {
    let defaultPath: string | undefined;
    try {
      const folder = await explorerFolder();
      if (folder) defaultPath = folder;
    } catch {
      // ignore
    }
    const filepath = await open({
      title: t('apex.configSnapshot.importTitle'),
      multiple: false,
      defaultPath,
      filters: [{name: 'JSON', extensions: ['json']}],
    });
    if (!filepath || typeof filepath !== 'string') return;
    const text = await readUtf8File({path: filepath});
    const snapshot = parseApexConfigSnapshot(text);
    apex_store.set_config_import_snapshot(snapshot);
    apex_store.open_config_import_dialog();
  } catch (e) {
    console.warn('open apex config import failed', e);
    const key =
      e instanceof ApexConfigSnapshotParseError
        ? e.message
        : (e instanceof Error ? e.message : String(e ?? '')).trim();
    toast.error(key || 'toast.importApexConfigSnapshotError', {timeout: 8000});
  }
}
</script>
<template>
  <v-col cols="12" class="page-content game-page-layout d-flex flex-column h-100 w-100 position-relative">
    <div class="apex-page-toolbar game-page-toolbar">
      <ApexLauncherUser
        class="apex-page-toolbar-user"
        @update_user="on_user_update"
      />
      <div class="apex-page-toolbar-controls">
        <div class="apex-toolbar-utility-actions">
          <div class="apex-toolbar-control-slot">
            <v-btn
              icon="mdi-auto-fix"
              size="small"
              variant="text"
              density="compact"
              class="apex-preset-btn"
              :title="t('apex.launchRepairTip')"
              :aria-label="t('apex.launchRepairTip')"
              @click="open_launch_repair"
            />
          </div>
          <div class="apex-toolbar-control-slot">
            <v-btn
              size="small"
              variant="text"
              density="compact"
              class="apex-preset-btn"
              :title="t('apex.pagePresetTip')"
              :aria-label="t('apex.pagePresetTip')"
              @click="open_quick_preset"
            >
              <v-icon icon="mdi-lightning-bolt-outline" size="small" />
            </v-btn>
          </div>
          <div v-if="settings_store.betaFeaturesEnabled" class="apex-toolbar-control-slot apex-q-tool-slot">
            <v-btn
              icon="mdi-angle-acute"
              size="small"
              variant="text"
              density="compact"
              class="apex-preset-btn"
              :title="t('apex.apexQ.toolbarTip')"
              :aria-label="t('apex.apexQ.toolbarTip')"
              @click="open_apex_q"
            />
            <span
              class="mx-beta-badge apex-q-beta-badge"
              :title="t('settings.betaFeaturesHint')"
            >{{ t('common.beta') }}</span>
          </div>
          <div class="apex-toolbar-control-slot">
            <v-btn
              size="small"
              variant="text"
              density="compact"
              class="apex-preset-btn"
              :title="t('apex.configSnapshot.exportTip')"
              :aria-label="t('apex.configSnapshot.exportTip')"
              @click="open_config_export"
            >
              <v-icon icon="mdi-application-export" size="small" />
            </v-btn>
          </div>
          <div class="apex-toolbar-control-slot">
            <v-btn
              size="small"
              variant="text"
              density="compact"
              class="apex-preset-btn"
              :title="t('apex.configSnapshot.importTip')"
              :aria-label="t('apex.configSnapshot.importTip')"
              @click="open_config_import"
            >
              <v-icon icon="mdi-application-import" size="small" />
            </v-btn>
          </div>
        </div>
        <div class="apex-page-switcher" role="region" :aria-label="t('apex.pageSwitcherLabel')">
          <v-btn-toggle
            :model-value="apex_store.page_type"
            @update:model-value="on_page_type_change"
            class="apex-page-type-toggle game-page-segmented-toggle"
            mandatory
            divided
            density="compact"
            color="primary"
            variant="text"
            border
            :disabled="apex_store.is_config_snapshot_applying"
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
            <v-btn
              size="small"
              :value="ApexPageTypeEnum.game_settings"
              :title="t('apex.pageGameSettings')"
              prepend-icon="mdi-gamepad-variant-outline"
            >
              {{ t('apex.pageGameSettings') }}
            </v-btn>
          </v-btn-toggle>
        </div>
      </div>
    </div>

    <div class="game-page-gap"/>

    <div class="game-page-main" style="flex:1;min-height:0;display:flex">
      <div v-if="is_initial_content_loading" class="apex-initial-loading">
        <v-skeleton-loader type="list-item-two-line@7" />
      </div>
      <div v-else-if="is_waiting_for_game_defaults" class="apex-defaults-pending text-medium-emphasis">
        <v-icon icon="mdi-progress-wrench" size="32"/>
        <span>{{ t('apex.history.pendingDefaults') }}</span>
      </div>
      <ApexSelectLaunchOptions
        v-else-if="apex_store.is_launch_page"
        style="flex:1;min-height:0;"/>
      <ApexVideoConfig
        v-else-if="apex_store.is_video_config_page && visited_video_tab"
        style="flex:1;min-height:0;"/>
      <ApexGameSettings
        v-else-if="visited_game_settings_tab"
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
          <v-btn
            icon="mdi-history"
            :title="t('apex.history.open')"
            :aria-label="t('apex.history.open')"
            @click="apex_store.open_config_history_dialog()"
          />
          <v-btn
            icon="mdi-restore-alert"
            :title="t('apex.history.resetTitle')"
            :aria-label="t('apex.history.resetTitle')"
            @click="apex_store.open_reset_defaults_dialog()"
          />
        </v-btn-group>
        <v-spacer></v-spacer>
        <v-btn-group density="compact" divided>
          <ApexStart/>
          <ApexApply/>
        </v-btn-group>
      </template>
      <template v-else-if="apex_store.is_video_config_page">
        <v-btn-group density="compact" divided>
          <GameRefreshIconButton
            :loading="video_refresh_loading"
            :title="`${t('apex.reloadVideoConfig')} · ${t('common.rightClickOpenConfigFolder')}`"
            @click="reload_apex_video_config"
            @contextmenu="open_video_config_folder"
          />
          <v-btn icon="mdi-history" :title="t('apex.history.open')" :aria-label="t('apex.history.open')" @click="apex_store.open_config_history_dialog()"/>
          <v-btn icon="mdi-restore-alert" :title="t('apex.history.resetTitle')" :aria-label="t('apex.history.resetTitle')" @click="apex_store.open_reset_defaults_dialog()"/>
        </v-btn-group>
        <v-spacer></v-spacer>
        <v-btn-group density="compact" divided>
          <ApexStart/>
          <ApexVideoConfigApply/>
        </v-btn-group>
      </template>
      <template v-else>
        <v-btn-group density="compact" divided>
          <GameRefreshIconButton
            :loading="game_settings_refresh_loading"
            :title="`${t('apex.gameSettings.reload')} · ${t('common.rightClickOpenConfigFolder')}`"
            @click="reload_apex_game_settings"
            @contextmenu="open_game_settings_folder"
          />
          <v-btn icon="mdi-history" :title="t('apex.history.open')" :aria-label="t('apex.history.open')" @click="apex_store.open_config_history_dialog()"/>
          <v-btn icon="mdi-restore-alert" :title="t('apex.history.resetTitle')" :aria-label="t('apex.history.resetTitle')" @click="apex_store.open_reset_defaults_dialog()"/>
        </v-btn-group>
        <v-spacer></v-spacer>
        <v-btn-group density="compact" divided>
          <ApexStart/>
          <ApexGameSettingsApply/>
        </v-btn-group>
      </template>
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
    <ApexSteamManualDownloadMilesLanguage v-if="apex_store.download_miles_language_manual_dialog"/>
    <ApexEaManualDownloadMilesLanguage v-if="apex_store.download_miles_language_manual_dialog_ea"/>
    <ApexSemiAutomaticDownloadLanguage v-if="apex_store.download_miles_language_semi_automatic_dialog"/>
    <ApexConfigExportDialog v-if="apex_store.config_export_dialog"/>
    <ApexConfigImportDialog v-if="apex_store.config_import_dialog"/>
    <ApexConfigHistoryDialog/>
    <ApexResetDefaultsDialog/>
  </v-col>
</template>
<style scoped>
.apex-initial-loading {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.apex-defaults-pending {
  display: flex;
  flex: 1 1 auto;
  min-height: 160px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  text-align: center;
}

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

.apex-toolbar-utility-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.apex-page-switcher {
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: thin;
}

.apex-page-switcher :deep(.apex-page-type-toggle) {
  width: max-content;
}

.apex-toolbar-control-slot {
  position: relative;
  display: flex;
  align-items: center;
  height: var(--game-page-control-height);
}

.apex-q-beta-badge {
  position: absolute;
  z-index: 2;
  top: -7px;
  right: -9px;
  min-height: 12px;
  padding-inline: 3px;
  font-size: 6px;
  pointer-events: none;
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

.apex-page-type-toggle :deep(.v-btn:focus-visible) {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
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

@media (max-width: 840px) {
  .apex-page-toolbar {
    flex-wrap: wrap;
  }

  .apex-page-toolbar-user {
    flex-basis: 100%;
  }

  .apex-page-toolbar-controls {
    width: 100%;
    flex-basis: 100%;
    margin-left: 0;
    justify-content: space-between;
  }

  .apex-page-switcher {
    flex: 1 1 auto;
  }
}

@media (max-width: 560px) {
  .apex-page-toolbar-controls {
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .apex-page-switcher {
    flex-basis: 100%;
    width: 100%;
  }
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
