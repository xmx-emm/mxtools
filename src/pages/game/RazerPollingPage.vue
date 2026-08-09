<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {open, confirm} from '@tauri-apps/plugin-dialog';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import BackgroundAutostartSwitch from '@/components/settings/BackgroundAutostartSwitch.vue';
import RazerPollingRateControl from '@/components/game/razer/RazerPollingRateControl.vue';
import {
  probeRazerPolling,
  restoreRazerPollingRate,
  scanInstalledGames,
  setRazerPollingRate,
  verifyRazerPollingCapabilities,
} from '@/ipc/commands.ts';
import {ipcErrorKey} from '@/ipc/error.ts';
import {useBackgroundRuntimeStore} from '@/stores/background_runtime.ts';
import type {
  RazerBackgroundConfig,
  RazerBackgroundGame,
} from '@/types/background_runtime.ts';
import type {InstalledGame, InstalledGameScanReport} from '@/types/game_scan.ts';
import type {RazerPollingStatus} from '@/types/razer_polling.ts';
import {
  createManualGame,
  mergeScannedGame,
  syncConnectedDeviceProfiles,
} from '@/utils/razer_polling_config.ts';
import {cloneRazerBackgroundConfig} from '@/utils/background_runtime.ts';

type TauriRuntimeWindow = Window & {__TAURI_INTERNALS__?: unknown};
const isTauriRuntime = typeof window !== 'undefined'
  && Boolean((window as TauriRuntimeWindow).__TAURI_INTERNALS__);

const {t, te} = useI18n();
const toast = useToast();
const runtime = useBackgroundRuntimeStore();
const statuses = ref<RazerPollingStatus[]>([]);
const selectedDeviceId = ref<string | null>(null);
const config = ref<RazerBackgroundConfig>({enabled: false, deviceProfiles: {}, games: []});
const loading = ref(false);
const applying = ref(false);
const scanning = ref(false);
const feedback = ref('');
const scanReport = ref<InstalledGameScanReport | null>(null);
const showOtherGames = ref(false);
const otherSearch = ref('');
const manualDialog = ref(false);
const manualName = ref('');
const manualExecutables = ref<string[]>([]);

const connected = computed(() => statuses.value.filter(status => status.available));
const selectedStatus = computed(() => connected.value.find(
  status => status.device.deviceId === selectedDeviceId.value,
) ?? connected.value[0] ?? null);
const selectedProfile = computed(() => selectedStatus.value
  ? config.value.deviceProfiles[selectedStatus.value.device.deviceId]
  : null);
const configuredIds = computed(() => new Set(config.value.games.map(game => game.id)));
const otherGames = computed(() => {
  const query = otherSearch.value.trim().toLocaleLowerCase();
  return (scanReport.value?.games ?? [])
    .filter(game => !game.isShooter && !configuredIds.value.has(game.logicalId))
    .filter(game => !query || game.name.toLocaleLowerCase().includes(query));
});
const rateOptions = computed(() => selectedProfile.value?.verifiedRatesHz.length
  ? selectedProfile.value.verifiedRatesHz
  : selectedStatus.value?.supportedRatesHz ?? []);

function errorMessage(error: unknown) {
  const key = ipcErrorKey(error);
  return key && te(key) ? t(key) : String(error);
}

function ensureDeviceProfiles() {
  syncConnectedDeviceProfiles(config.value, statuses.value);
  if (!connected.value.some(status => status.device.deviceId === selectedDeviceId.value)) {
    selectedDeviceId.value = connected.value[0]?.device.deviceId ?? null;
  }
}

async function persistConfig() {
  const result = await runtime.configureRazer(cloneRazerBackgroundConfig(config.value));
  if (result) statuses.value = result.statuses;
  ensureDeviceProfiles();
}

async function refreshDevices() {
  if (!isTauriRuntime || loading.value) return;
  loading.value = true;
  feedback.value = '';
  try {
    statuses.value = await probeRazerPolling();
    ensureDeviceProfiles();
  } catch (error) {
    feedback.value = errorMessage(error);
  } finally {
    loading.value = false;
  }
}

async function setRate(deviceId: string, rateHz: number) {
  applying.value = true;
  feedback.value = '';
  try {
    const result = await setRazerPollingRate(deviceId, rateHz);
    const status = statuses.value.find(item => item.device.deviceId === deviceId);
    if (status) status.currentRateHz = result.currentRateHz;
    toast.success(t('razerPolling.applied', {rate: result.currentRateHz}));
  } catch (error) {
    feedback.value = errorMessage(error);
    await refreshDevices();
  } finally {
    applying.value = false;
  }
}

async function restore(deviceId: string) {
  applying.value = true;
  feedback.value = '';
  try {
    const result = await restoreRazerPollingRate(deviceId);
    const status = statuses.value.find(item => item.device.deviceId === deviceId);
    if (status) status.currentRateHz = result.currentRateHz;
    toast.success(t('razerPolling.restored', {rate: result.currentRateHz}));
  } catch (error) {
    feedback.value = errorMessage(error);
  } finally {
    applying.value = false;
  }
}

async function verifyCapabilities(deviceId: string) {
  const accepted = await confirm(t('razerPolling.verifyCapabilitiesConfirm'), {
    title: t('razerPolling.verifyCapabilities'),
    kind: 'warning',
  });
  if (!accepted) return;
  applying.value = true;
  feedback.value = '';
  try {
    const result = await verifyRazerPollingCapabilities(deviceId);
    const profile = config.value.deviceProfiles[deviceId];
    if (profile) profile.verifiedRatesHz = result.supportedRatesHz;
    await persistConfig();
    await refreshDevices();
    toast.success(t('razerPolling.capabilitiesVerified', {
      rate: result.highestConfirmedRateHz ?? '-',
    }));
  } catch (error) {
    feedback.value = errorMessage(error);
  } finally {
    applying.value = false;
  }
}

function addOrRefreshScannedGame(game: InstalledGame, userEdited: boolean) {
  mergeScannedGame(config.value, game, statuses.value, userEdited);
}

async function scanGames() {
  if (!isTauriRuntime || scanning.value) return;
  scanning.value = true;
  feedback.value = '';
  try {
    scanReport.value = await scanInstalledGames();
    for (const game of scanReport.value.games.filter(item => item.isShooter)) {
      addOrRefreshScannedGame(game, false);
    }
    await persistConfig();
  } catch (error) {
    feedback.value = errorMessage(error);
  } finally {
    scanning.value = false;
  }
}

async function chooseExecutable() {
  if (!isTauriRuntime) return null;
  const selected = await open({
    multiple: false,
    filters: [{name: t('razerPolling.executable'), extensions: ['exe']}],
  });
  return typeof selected === 'string' ? selected : null;
}

async function addScannedGame(game: InstalledGame) {
  if (!game.matchers.length) {
    const executable = await chooseExecutable();
    if (!executable) return;
    game = {...game, matchers: [{kind: 'executablePath', value: executable}]};
  }
  addOrRefreshScannedGame(game, true);
  await persistConfig();
}

async function attachExecutable(game: RazerBackgroundGame) {
  const executable = await chooseExecutable();
  if (!executable) return;
  if (!game.matchers.some(matcher => matcher.executable?.toLocaleLowerCase()
    === executable.toLocaleLowerCase())) {
    game.matchers.push({executable, packageFamilyName: null, source: 'manual'});
  }
  game.enabled = true;
  game.userEdited = true;
  await persistConfig();
}

function markGameEdited(game: RazerBackgroundGame) {
  game.userEdited = true;
  void persistConfig().catch(error => {
    feedback.value = errorMessage(error);
  });
}

function setGameRate(game: RazerBackgroundGame, rateHz: number) {
  if (!selectedDeviceId.value) return;
  game.deviceRatesHz[selectedDeviceId.value] = rateHz;
  markGameEdited(game);
}

function updateIdleRate(rateHz: number) {
  if (!selectedProfile.value) return;
  selectedProfile.value.idleRateHz = rateHz;
  void persistConfig().catch(error => {
    feedback.value = errorMessage(error);
  });
}

function openManualDialog() {
  manualName.value = '';
  manualExecutables.value = [];
  manualDialog.value = true;
}

async function addManualExecutable() {
  const executable = await chooseExecutable();
  if (executable && !manualExecutables.value.includes(executable)) {
    manualExecutables.value.push(executable);
  }
}

async function saveManualGame() {
  const name = manualName.value.trim();
  if (!name || !manualExecutables.value.length) return;
  const id = `manual-${Date.now().toString(36)}-${config.value.games.length}`;
  config.value.games.push(createManualGame(id, name, manualExecutables.value, statuses.value));
  manualDialog.value = false;
  await persistConfig();
}

async function toggleAutomatic(value: boolean | null) {
  config.value.enabled = value ?? false;
  await persistConfig();
}

onMounted(async () => {
  if (!isTauriRuntime) return;
  try {
    if (!runtime.snapshot) await runtime.refresh();
    if (runtime.snapshot) config.value = cloneRazerBackgroundConfig(runtime.snapshot.config.razer);
    await refreshDevices();
  } catch (error) {
    feedback.value = errorMessage(error);
  }
});
</script>

<template>
  <div class="app-page razer-polling-page">
    <header class="app-page__header razer-page-header">
      <div class="app-page__heading">
        <div class="app-page__eyebrow">{{ t('game.eyebrow') }}</div>
        <h1 class="app-page__title">
          {{ t('razerPolling.title') }}
          <span class="mx-beta-badge" :title="t('settings.betaFeaturesHint')">{{ t('common.beta') }}</span>
        </h1>
        <p class="app-page__subtitle">{{ t('razerPolling.subtitle') }}</p>
      </div>
      <div class="razer-page-actions">
        <v-btn
          size="small"
          variant="tonal"
          prepend-icon="mdi-radar"
          :loading="scanning"
          :disabled="!isTauriRuntime"
          @click="scanGames"
        >
          {{ t('razerPolling.scanGames') }}
        </v-btn>
        <v-btn size="small" variant="text" prepend-icon="mdi-plus" @click="openManualDialog">
          {{ t('razerPolling.manualAdd') }}
        </v-btn>
      </div>
    </header>

    <div class="app-page__scroll">
      <main class="app-page__content razer-page-content">
        <RazerPollingRateControl
          :statuses="statuses"
          :selected-device-id="selectedDeviceId"
          :loading="loading"
          :applying="applying"
          @refresh="refreshDevices"
          @select-device="selectedDeviceId = $event"
          @set-rate="setRate"
          @restore="restore"
          @verify="verifyCapabilities"
        />

        <section class="razer-background app-section">
          <header>
            <div>
              <h2>{{ t('razerPolling.backgroundTitle') }}</h2>
              <p>{{ t('razerPolling.backgroundHint') }}</p>
            </div>
            <v-switch
              :model-value="config.enabled"
              color="primary"
              density="compact"
              hide-details
              :disabled="!connected.length || applying"
              @update:model-value="toggleAutomatic"
            />
          </header>
          <div class="razer-autostart-row">
            <BackgroundAutostartSwitch compact />
          </div>
          <div v-if="selectedProfile" class="razer-idle-rate">
            <span>{{ t('razerPolling.idleRate') }}</span>
            <v-select
              :model-value="selectedProfile.idleRateHz"
              :items="rateOptions"
              density="compact"
              variant="outlined"
              hide-details
              @update:model-value="updateIdleRate"
            />
          </div>
        </section>

        <section class="razer-games">
          <header class="razer-section-heading">
            <div>
              <h2>{{ t('razerPolling.gameProfiles') }}</h2>
              <p>{{ t('razerPolling.gameProfilesHint') }}</p>
            </div>
            <span>{{ config.games.length }}</span>
          </header>

          <div v-if="config.games.length" class="razer-game-list">
            <article v-for="game in config.games" :key="game.id" class="razer-game-row">
              <v-switch
                :model-value="game.enabled"
                color="primary"
                density="compact"
                hide-details
                :aria-label="t('razerPolling.toggleGame', {name: game.name})"
                @update:model-value="game.enabled = $event ?? false; markGameEdited(game)"
              />
              <div class="razer-game-copy">
                <strong>{{ game.name }}</strong>
                <span>
                  {{ game.matchers.length
                    ? t('razerPolling.matcherCount', {count: game.matchers.length})
                    : t('razerPolling.executableRequired') }}
                </span>
              </div>
              <v-select
                v-if="game.matchers.length && selectedDeviceId"
                class="razer-game-rate"
                :model-value="game.deviceRatesHz[selectedDeviceId]"
                :items="rateOptions"
                :label="t('razerPolling.gameRate')"
                density="compact"
                variant="outlined"
                hide-details
                @update:model-value="setGameRate(game, $event)"
              />
              <v-btn
                v-else-if="!game.matchers.length"
                class="razer-game-executable"
                size="small"
                variant="tonal"
                prepend-icon="mdi-file-plus-outline"
                @click="attachExecutable(game)"
              >
                {{ t('razerPolling.addExecutable') }}
              </v-btn>
            </article>
          </div>
          <p v-else class="razer-empty">{{ t('razerPolling.noProfiles') }}</p>
        </section>

        <section v-if="scanReport" class="razer-scan-results">
          <div class="razer-source-statuses">
            <span
              v-for="source in scanReport.sources"
              :key="source.source"
              :class="`razer-source--${source.status}`"
              :title="source.errors.map(error => error.message).join('\n')"
            >
              {{ t(`razerPolling.sources.${source.source}`) }} · {{ t(`razerPolling.sourceStatus.${source.status}`) }}
            </span>
          </div>
          <button class="razer-other-toggle" type="button" @click="showOtherGames = !showOtherGames">
            <v-icon :icon="showOtherGames ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="17" />
            <span>{{ t('razerPolling.otherGames', {count: otherGames.length}) }}</span>
          </button>
          <div v-if="showOtherGames" class="razer-other-games">
            <v-text-field
              v-model="otherSearch"
              class="app-search-field"
              prepend-inner-icon="mdi-magnify"
              :placeholder="t('razerPolling.searchOtherGames')"
              density="compact"
              variant="outlined"
              hide-details
              clearable
            />
            <article v-for="game in otherGames" :key="game.logicalId" class="razer-other-row">
              <div>
                <strong>{{ game.name }}</strong>
                <span>{{ game.sources.map(source => t(`razerPolling.sources.${source}`)).join(' · ') }}</span>
              </div>
              <v-btn size="small" variant="text" prepend-icon="mdi-plus" @click="addScannedGame(game)">
                {{ t('common.add') }}
              </v-btn>
            </article>
            <p v-if="!otherGames.length" class="razer-empty">{{ t('razerPolling.noOtherGames') }}</p>
          </div>
        </section>

        <v-alert v-if="feedback" type="warning" variant="tonal" density="compact">
          {{ feedback }}
        </v-alert>
      </main>
    </div>

    <v-dialog v-model="manualDialog" max-width="560">
      <v-card>
        <v-card-title>{{ t('razerPolling.manualAdd') }}</v-card-title>
        <v-card-text class="razer-manual-form">
          <v-text-field v-model="manualName" :label="t('razerPolling.gameName')" />
          <div class="razer-manual-files">
            <div v-for="(path, index) in manualExecutables" :key="path">
              <span :title="path">{{ path }}</span>
              <v-btn
                class="mx-compact-icon-button"
                icon="mdi-close"
                size="small"
                variant="text"
                :aria-label="t('common.remove')"
                @click="manualExecutables.splice(index, 1)"
              />
            </div>
          </div>
          <v-btn variant="tonal" prepend-icon="mdi-file-plus-outline" @click="addManualExecutable">
            {{ t('razerPolling.addExecutable') }}
          </v-btn>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="manualDialog = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" :disabled="!manualName.trim() || !manualExecutables.length" @click="saveManualGame">
            {{ t('common.add') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.razer-polling-page { container: workspace / inline-size; }
.razer-page-header { align-items: center; }
.razer-page-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.razer-page-actions .v-btn { min-height: var(--app-control-height-action); height: var(--app-control-height-action); border-radius: var(--app-radius-sm); letter-spacing: 0; text-transform: none; }
.razer-page-content { display: grid; gap: var(--app-space-5); padding-bottom: var(--app-space-6); }
.razer-background { overflow: hidden; }
.razer-background > header, .razer-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; }
.razer-background h2, .razer-section-heading h2 { margin: 0; font-size: 12px; font-weight: 680; }
.razer-background p, .razer-section-heading p { margin: 3px 0 0; color: rgba(var(--v-theme-on-surface), .5); font-size: 10px; line-height: 1.45; }
.razer-autostart-row { border-top: 1px solid var(--app-border); }
.razer-autostart-row :deep(.background-autostart--compact) { min-width: 0; padding: 8px 16px; box-sizing: border-box; }
.razer-idle-rate { display: grid; grid-template-columns: minmax(0, 1fr) 180px; align-items: center; gap: 16px; min-height: 58px; padding: 8px 16px; border-top: 1px solid var(--app-border); font-size: 11px; }
.razer-games, .razer-scan-results { border-top: 1px solid var(--app-border); border-bottom: 1px solid var(--app-border); }
.razer-section-heading > span { color: rgba(var(--v-theme-on-surface), .45); font-size: 11px; }
.razer-game-list, .razer-other-games { border-top: 1px solid var(--app-border); }
.razer-game-row { display: grid; grid-template-columns: 42px minmax(0, 1fr) 180px; align-items: center; gap: 12px; min-height: 68px; padding: 9px 16px; }
.razer-game-row + .razer-game-row, .razer-other-row + .razer-other-row { border-top: 1px solid rgba(var(--v-border-color), .075); }
.razer-game-copy, .razer-other-row > div { display: flex; flex-direction: column; min-width: 0; gap: 3px; }
.razer-game-copy strong, .razer-other-row strong { overflow-wrap: anywhere; font-size: 11px; font-weight: 640; }
.razer-game-copy span, .razer-other-row span { color: rgba(var(--v-theme-on-surface), .48); font-size: 9px; line-height: 1.4; }
.razer-source-statuses { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 16px; }
.razer-source-statuses > span { padding: 3px 7px; border: 1px solid var(--app-border); border-radius: var(--app-radius-sm); color: rgba(var(--v-theme-on-surface), .56); font-size: 9px; }
.razer-source--partial, .razer-source--failed { color: rgb(var(--v-theme-warning)) !important; }
.razer-other-toggle { display: flex; align-items: center; width: 100%; min-height: 42px; gap: 7px; padding: 0 16px; border: 0; border-top: 1px solid var(--app-border); color: inherit; background: transparent; font: inherit; font-size: 11px; cursor: pointer; }
.razer-other-toggle:hover { background: var(--app-hover); }
.razer-other-games > .app-search-field { margin: 12px 16px; max-width: 360px; }
.razer-other-row { display: flex; align-items: center; justify-content: space-between; min-height: 54px; gap: 14px; padding: 8px 16px; }
.razer-empty { margin: 0; padding: 18px 16px; color: rgba(var(--v-theme-on-surface), .5); font-size: 10px; }
.razer-manual-form { display: grid; gap: 12px; }
.razer-manual-files { display: grid; max-height: 180px; overflow-y: auto; }
.razer-manual-files > div { display: flex; align-items: center; min-width: 0; gap: 8px; border-bottom: 1px solid var(--app-border); }
.razer-manual-files span { flex: 1; min-width: 0; overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
@container workspace (max-width: 680px) {
  .razer-page-header { align-items: flex-start; flex-direction: column; }
  .razer-page-actions { justify-content: flex-start; }
  .razer-game-row { grid-template-columns: 42px minmax(0, 1fr); }
  .razer-game-rate { grid-column: 2; width: 100%; }
  .razer-game-executable { grid-column: 2; justify-self: start; }
  .razer-idle-rate { grid-template-columns: 1fr; }
}
</style>
