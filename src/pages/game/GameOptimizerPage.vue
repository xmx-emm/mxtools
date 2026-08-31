<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {open} from '@tauri-apps/plugin-dialog';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {
  applyGameOptimizer,
  benchmarkGameNetwork,
  openMsSettingsPage,
  scanGameOptimizer,
} from '@/ipc/commands.ts';
import {evaluateGameOptimizer} from '@/utils/game_optimizer.ts';
import type {
  CheckCategory,
  CheckStatus,
  GameOptimizerActionResult,
  GameOptimizerCheck,
  GameOptimizerEvaluation,
  GameOptimizerReport,
  NetworkBenchmark,
} from '@/types/game_optimizer.ts';

type FilterTab = 'all' | 'warning' | 'pass';

interface SettingsEntry {
  key: string;
  uri: string;
  icon: string;
}

type TauriRuntimeWindow = Window & {__TAURI_INTERNALS__?: unknown};
const isTauriRuntime = typeof window !== 'undefined'
  && Boolean((window as TauriRuntimeWindow).__TAURI_INTERNALS__);

const {t, te, locale} = useI18n();
const toast = useToast();

const report = ref<GameOptimizerReport | null>(null);
const benchmark = ref<NetworkBenchmark | null>(null);
const evaluation = ref<GameOptimizerEvaluation | null>(null);
const gamePath = ref<string | null>(null);
const tab = ref<FilterTab>('all');
const loading = ref(false);
const testing = ref(false);
const applying = ref(false);
const scanError = ref('');
const selected = ref<string[]>([]);
const benchmarkHost = ref(locale.value.toLowerCase().startsWith('zh') ? '223.5.5.5' : '1.1.1.1');

const categories: CheckCategory[] = [
  'input',
  'display',
  'power',
  'graphics',
  'network',
  'storage',
  'software',
];
const defaultActionIds = new Set(['accessibility_shortcuts', 'mouse_acceleration']);
const settingsEntries: SettingsEntry[] = [
  {key: 'advancedDisplay', uri: 'ms-settings:display-advanced', icon: 'mdi-monitor-dashboard'},
  {key: 'graphics', uri: 'ms-settings:display-advancedgraphics', icon: 'mdi-expansion-card'},
  {key: 'gameMode', uri: 'ms-settings:gaming-gamemode', icon: 'mdi-controller'},
  {key: 'capture', uri: 'ms-settings:gaming-gamedvr', icon: 'mdi-video'},
  {key: 'mouse', uri: 'ms-settings:mousetouch', icon: 'mdi-mouse'},
  {key: 'pointer', uri: 'ms-settings:easeofaccess-mousepointer', icon: 'mdi-cursor-default'},
  {key: 'bluetooth', uri: 'ms-settings:bluetooth', icon: 'mdi-bluetooth'},
  {key: 'power', uri: 'ms-settings:powersleep', icon: 'mdi-power'},
];
const unavailableKeys: Record<string, string> = {
  'input.accessibility': 'accessibility',
  'input.mouse': 'mouse',
  'display.primary': 'display',
  'power.status': 'power',
  'power.plan': 'power',
  'power.usb': 'usb',
  'power.usbSelectiveSuspend': 'usb',
  'network.adapters': 'network',
  'storage.driveType': 'storage',
  'storage.space': 'storageSpace',
  'storage.gamePath': 'gamePath',
};

const actionableWarnings = computed(() => new Set(
  (evaluation.value?.checks ?? [])
    .filter(check => check.status === 'warning' && check.actionId)
    .map(check => check.actionId as string),
));
const selectedActions = computed(() => (
  selected.value.filter(id => actionableWarnings.value.has(id))
));
const visibleChecks = computed(() => (
  (evaluation.value?.checks ?? []).filter(check => {
    if (tab.value === 'warning') return check.status === 'warning';
    if (tab.value === 'pass') return check.status === 'pass';
    return true;
  })
));
const groupedChecks = computed(() => (
  categories
    .map(category => ({
      category,
      checks: visibleChecks.value.filter(check => check.category === category),
    }))
    .filter(group => group.checks.length > 0)
));
const score = computed(() => evaluation.value?.score ?? 0);
const scoreText = computed(() => evaluation.value ? String(score.value) : '--');
const scoreColor = computed(() => {
  if (!evaluation.value) return 'primary';
  if (score.value >= 85) return 'success';
  if (score.value >= 60) return 'warning';
  return 'error';
});
const selectedGameName = computed(() => (
  gamePath.value?.split(/[\\/]/).pop() ?? ''
));
const activeAdapter = computed(() => {
  const adapters = report.value?.network.adapters ?? [];
  return adapters.find(item => item.kind === 'ethernet')
    ?? adapters.find(item => item.kind === 'wifi')
    ?? adapters[0]
    ?? null;
});
const linkLabel = computed(() => {
  const adapter = activeAdapter.value;
  if (!adapter) return t('gameOptimizer.network.linkUnknown');
  const type = t(`gameOptimizer.network.${adapter.kind}`);
  return adapter.linkSpeed ? `${type} / ${formatLinkSpeed(adapter.linkSpeed)}` : type;
});
const unavailableLabels = computed(() => (
  (report.value?.unavailable ?? []).map(item => {
    const translatedKey = unavailableKeys[item];
    return translatedKey ? t(`gameOptimizer.unavailableItems.${translatedKey}`) : item;
  })
));

const statusIcons: Record<CheckStatus, string> = {
  pass: 'mdi-check-circle',
  warning: 'mdi-alert-circle',
  info: 'mdi-information-outline',
  unknown: 'mdi-help-circle-outline',
};
const statusColors: Record<CheckStatus, string> = {
  pass: 'success',
  warning: 'warning',
  info: 'info',
  unknown: 'grey',
};

function statusText(status: CheckStatus): string {
  return t(`gameOptimizer.status.${status}`);
}

function title(check: GameOptimizerCheck): string {
  return t(check.titleKey, check.params);
}

function detail(check: GameOptimizerCheck): string {
  const params = {...check.params};
  if (check.id === 'storage_type' && typeof params.type === 'string') {
    params.type = t(`gameOptimizer.driveTypes.${params.type}`);
  }
  if (check.id === 'gpu_preference' && typeof params.preference === 'string') {
    params.preference = t(`gameOptimizer.gpuPreferences.${params.preference}`);
  }
  return t(check.detailKey, params);
}

function formatMetric(value: number | null): string {
  return value === null ? '-' : String(Number(value.toFixed(1)));
}

function formatLinkSpeed(value: string): string {
  const bitsPerSecond = Number(value);
  if (!Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) return value;
  if (bitsPerSecond >= 1_000_000_000) {
    return `${Number((bitsPerSecond / 1_000_000_000).toFixed(1))} Gbps`;
  }
  if (bitsPerSecond >= 1_000_000) {
    return `${Number((bitsPerSecond / 1_000_000).toFixed(1))} Mbps`;
  }
  return `${Number((bitsPerSecond / 1_000).toFixed(1))} Kbps`;
}

function translatedError(value: unknown): string {
  const raw = String(value ?? '');
  return raw && te(raw) ? t(raw) : raw;
}

async function scan() {
  if (!isTauriRuntime) return;
  loading.value = true;
  scanError.value = '';
  try {
    const nextReport = await scanGameOptimizer({gamePath: gamePath.value});
    report.value = nextReport;
    evaluation.value = evaluateGameOptimizer(nextReport, benchmark.value);
    selected.value = [...defaultActionIds].filter(id => actionableWarnings.value.has(id));
  } catch (error) {
    scanError.value = translatedError(error);
    toast.error(`${t('gameOptimizer.scanFailed')}: ${scanError.value}`);
  } finally {
    loading.value = false;
  }
}

async function chooseGame() {
  if (!isTauriRuntime) return;
  try {
    const path = await open({
      multiple: false,
      filters: [{name: t('gameOptimizer.executable'), extensions: ['exe']}],
    });
    if (typeof path === 'string') {
      gamePath.value = path;
      localStorage.setItem('mx-game-optimizer-path', path);
      await scan();
    }
  } catch (error) {
    toast.error(`${t('gameOptimizer.chooseGameFailed')}: ${translatedError(error)}`);
  }
}

async function clearGame() {
  gamePath.value = null;
  localStorage.removeItem('mx-game-optimizer-path');
  await scan();
}

async function runBenchmark() {
  if (!isTauriRuntime) return;
  testing.value = true;
  try {
    benchmark.value = await benchmarkGameNetwork({host: benchmarkHost.value, count: 8});
    if (report.value) {
      evaluation.value = evaluateGameOptimizer(report.value, benchmark.value);
    }
    toast.success(t('gameOptimizer.networkTestDone'));
  } catch (error) {
    toast.error(`${t('gameOptimizer.networkTestFailed')}: ${translatedError(error)}`);
  } finally {
    testing.value = false;
  }
}

async function applySelected() {
  if (!isTauriRuntime) return;
  const actions = selectedActions.value;
  if (!actions.length || applying.value) return;

  applying.value = true;
  try {
    const results: GameOptimizerActionResult[] = await applyGameOptimizer({actions});
    for (const result of results) {
      const actionCheck = evaluation.value?.checks.find(check => check.actionId === result.id);
      const name = actionCheck ? title(actionCheck) : result.id;
      if (result.success) {
        toast.success(t('gameOptimizer.actionSuccess', {name}));
      } else {
        toast.error(t('gameOptimizer.actionFailed', {
          name,
          error: translatedError(result.error),
        }));
      }
    }
    await scan();
  } catch (error) {
    toast.error(`${t('gameOptimizer.applyFailed')}: ${translatedError(error)}`);
  } finally {
    applying.value = false;
  }
}

async function openSettings(uri: string) {
  if (!isTauriRuntime) return;
  try {
    await openMsSettingsPage({uri});
  } catch (error) {
    toast.error(translatedError(error));
  }
}

onMounted(() => {
  const storedPath = localStorage.getItem('mx-game-optimizer-path');
  if (storedPath) gamePath.value = storedPath;
  if (isTauriRuntime) void scan();
});
</script>

<template>
  <div class="app-page game-optimizer-page">
    <header class="app-page__header optimizer-header">
      <div class="app-page__heading">
        <div class="app-page__eyebrow">{{ t('game.eyebrow') }}</div>
        <h1 class="app-page__title optimizer-header__title">
          {{ t('gameOptimizer.title') }}
          <span class="mx-beta-badge" :title="t('settings.betaFeaturesHint')">{{ t('common.beta') }}</span>
        </h1>
        <p class="app-page__subtitle">{{ t('gameOptimizer.subtitle') }}</p>
      </div>
      <div class="optimizer-header__actions">
        <v-tooltip :text="t('gameOptimizer.rescan')" location="bottom">
          <template #activator="{props}">
            <v-btn
              v-bind="props"
              class="mx-compact-icon-button"
              icon="mdi-refresh"
              size="small"
              variant="text"
              :loading="loading"
              :disabled="applying"
              :aria-label="t('gameOptimizer.rescan')"
              @click="scan"
            />
          </template>
        </v-tooltip>
        <v-btn
          class="optimizer-compact-action"
          size="small"
          variant="tonal"
          prepend-icon="mdi-file-search-outline"
          :disabled="loading || applying"
          @click="chooseGame"
        >
          {{ t('gameOptimizer.chooseGame') }}
        </v-btn>
      </div>
    </header>

    <div class="app-page__scroll">
      <main class="app-page__content optimizer-content">
        <section
          class="optimizer-overview"
          :aria-label="t('gameOptimizer.environmentScore')"
          :aria-busy="loading"
          aria-live="polite"
        >
          <div class="optimizer-score">
            <v-progress-circular
              :model-value="evaluation ? score : 0"
              :color="scoreColor"
              :size="84"
              :width="7"
            >
              <strong>{{ scoreText }}</strong>
            </v-progress-circular>
            <span>{{ t('gameOptimizer.environmentScore') }}</span>
          </div>

          <dl class="optimizer-stats">
            <div>
              <dt>{{ t('gameOptimizer.pending') }}</dt>
              <dd>{{ evaluation?.warningCount ?? '-' }}</dd>
            </div>
            <div>
              <dt>{{ t('gameOptimizer.passed') }}</dt>
              <dd>{{ evaluation?.passCount ?? '-' }}</dd>
            </div>
            <div>
              <dt>{{ t('gameOptimizer.fixable') }}</dt>
              <dd>{{ evaluation?.actionableCount ?? '-' }}</dd>
            </div>
          </dl>

          <div v-if="gamePath" class="optimizer-selected-game">
            <v-icon icon="mdi-controller" size="18" aria-hidden="true" />
            <span :title="gamePath">{{ selectedGameName }}</span>
            <v-tooltip :text="t('gameOptimizer.clearGame')" location="bottom">
              <template #activator="{props}">
                <v-btn
                  v-bind="props"
                  class="mx-compact-icon-button"
                  icon="mdi-close"
                  size="small"
                  variant="text"
                  :disabled="loading || applying"
                  :aria-label="t('gameOptimizer.clearGame')"
                  @click="clearGame"
                />
              </template>
            </v-tooltip>
          </div>
        </section>

        <v-alert
          v-if="scanError && !evaluation"
          class="scan-error"
          type="error"
          variant="tonal"
          density="compact"
        >
          <div class="scan-error__content">
            <span>{{ scanError }}</span>
            <v-btn class="optimizer-compact-action" size="small" variant="text" @click="scan">
              {{ t('gameOptimizer.rescan') }}
            </v-btn>
          </div>
        </v-alert>

        <section class="optimizer-network" aria-labelledby="optimizer-network-title">
          <div class="network__content">
            <div class="network__heading">
              <h2 id="optimizer-network-title">{{ t('gameOptimizer.network.title') }}</h2>
              <span>{{ t('gameOptimizer.network.target', {host: benchmarkHost}) }}</span>
            </div>
            <div class="network__metrics">
              <div>
                <span>{{ t('gameOptimizer.network.ping') }}</span>
                <b>{{ formatMetric(benchmark?.averageMs ?? null) }} ms</b>
              </div>
              <div>
                <span>{{ t('gameOptimizer.network.jitter') }}</span>
                <b>{{ formatMetric(benchmark?.jitterMs ?? null) }} ms</b>
              </div>
              <div>
                <span>{{ t('gameOptimizer.network.loss') }}</span>
                <b>{{ benchmark ? formatMetric(benchmark.lossPercent) : '-' }}%</b>
              </div>
              <div>
                <span>{{ t('gameOptimizer.network.link') }}</span>
                <b>{{ linkLabel }}</b>
              </div>
            </div>
          </div>
          <v-btn
            class="optimizer-compact-action"
            size="small"
            variant="outlined"
            :loading="testing"
            :disabled="loading"
            prepend-icon="mdi-lan-check"
            @click="runBenchmark"
          >
            {{ t('gameOptimizer.network.run') }}
          </v-btn>
        </section>

        <v-tabs v-model="tab" density="compact" color="primary" class="optimizer-tabs">
          <v-tab value="all">
            {{ t('gameOptimizer.tabs.all') }}
            <span class="optimizer-tab-count">{{ evaluation?.checks.length ?? 0 }}</span>
          </v-tab>
          <v-tab value="warning">
            {{ t('gameOptimizer.tabs.warning') }}
            <span class="optimizer-tab-count">{{ evaluation?.warningCount ?? 0 }}</span>
          </v-tab>
          <v-tab value="pass">
            {{ t('gameOptimizer.tabs.pass') }}
            <span class="optimizer-tab-count">{{ evaluation?.passCount ?? 0 }}</span>
          </v-tab>
        </v-tabs>

        <div v-if="loading && !evaluation" class="initial-loading">
          <v-skeleton-loader type="list-item-two-line@6" />
        </div>
        <v-progress-linear v-else-if="loading" indeterminate color="primary" class="scan-progress" />

        <template v-if="evaluation">
          <section
            v-for="group in groupedChecks"
            :key="group.category"
            class="check-group"
            :aria-labelledby="`optimizer-group-${group.category}`"
          >
            <h2 :id="`optimizer-group-${group.category}`">
              {{ t(`gameOptimizer.categories.${group.category}`) }}
            </h2>
            <div v-for="item in group.checks" :key="item.id" class="check-row">
              <div class="check-row__select">
                <v-checkbox
                  v-if="item.actionId && item.status === 'warning'"
                  v-model="selected"
                  :value="item.actionId"
                  density="compact"
                  hide-details
                  :aria-label="title(item)"
                />
              </div>
              <v-tooltip :text="statusText(item.status)" location="bottom">
                <template #activator="{props}">
                  <v-icon
                    v-bind="props"
                    :icon="statusIcons[item.status]"
                    :color="statusColors[item.status]"
                    size="20"
                    :aria-label="statusText(item.status)"
                  />
                </template>
              </v-tooltip>
              <div class="check-row__copy">
                <b>{{ title(item) }}</b>
                <span>{{ detail(item) }}</span>
              </div>
              <div class="check-row__action">
                <v-tooltip v-if="item.settingsUri" :text="t('gameOptimizer.openSettings')">
                  <template #activator="{props}">
                    <v-btn
                      v-bind="props"
                      class="mx-compact-icon-button"
                      icon="mdi-open-in-new"
                      size="small"
                      variant="text"
                      :aria-label="t('gameOptimizer.openSettings')"
                      @click="openSettings(item.settingsUri)"
                    />
                  </template>
                </v-tooltip>
              </div>
            </div>
          </section>

          <div v-if="groupedChecks.length === 0" class="empty-filter">
            {{ t('gameOptimizer.noChecks') }}
          </div>

          <div v-if="unavailableLabels.length" class="notice">
            <v-icon icon="mdi-information-outline" size="18" aria-hidden="true" />
            <span>{{ t('gameOptimizer.unavailable', {items: unavailableLabels.join(t('gameOptimizer.listSeparator'))}) }}</span>
          </div>
        </template>

      </main>
    </div>

    <footer class="optimizer-actions">
      <div class="optimizer-actions__inner">
        <v-menu>
          <template #activator="{props}">
            <v-btn
              v-bind="props"
              class="optimizer-footer-action"
              size="small"
              variant="text"
              prepend-icon="mdi-cog-outline"
              append-icon="mdi-chevron-down"
            >
              {{ t('gameOptimizer.settings.title') }}
            </v-btn>
          </template>
          <v-list density="compact">
            <v-list-item
              v-for="entry in settingsEntries"
              :key="entry.key"
              @click="openSettings(entry.uri)"
            >
              <template #prepend>
                <v-icon :icon="entry.icon" />
              </template>
              <v-list-item-title>{{ t(`gameOptimizer.settings.${entry.key}`) }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
        <v-btn
          class="optimizer-footer-action"
          size="small"
          color="primary"
          :disabled="selectedActions.length === 0 || applying"
          :loading="applying"
          prepend-icon="mdi-auto-fix"
          @click="applySelected"
        >
          {{ t('gameOptimizer.applySelected', {count: selectedActions.length}) }}
        </v-btn>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.game-optimizer-page {
  color: rgba(var(--v-theme-on-surface), 0.9);
  letter-spacing: 0;
}

.optimizer-header__title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
}

.optimizer-header__actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: var(--app-space-2);
}

.optimizer-compact-action.v-btn {
  min-height: var(--app-control-height-compact) !important;
  height: var(--app-control-height-compact) !important;
  padding-inline: 10px !important;
  border-radius: var(--app-radius-sm) !important;
  letter-spacing: 0;
  text-transform: none;
}

.optimizer-content {
  padding-bottom: var(--app-space-6);
}

.optimizer-overview {
  display: grid;
  grid-template-columns: auto minmax(240px, 1fr) auto;
  align-items: center;
  min-width: 0;
  min-height: 112px;
  gap: var(--app-space-6);
  padding: 4px 8px 18px;
  border-bottom: 1px solid var(--app-border);
}

.optimizer-score {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: var(--app-space-3);
}

.optimizer-score strong {
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.optimizer-score > span,
.optimizer-stats dt {
  display: block;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 11px;
  line-height: 1.4;
}

.optimizer-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(72px, 1fr));
  min-width: 0;
  gap: 0;
  margin: 0;
  padding: 0;
}

.optimizer-stats > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  padding: 2px 20px;
  border-left: 1px solid var(--app-border);
}

.optimizer-stats dt {
  order: 2;
}

.optimizer-stats dd {
  order: 1;
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 17px;
  font-weight: 680;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.optimizer-selected-game {
  display: flex;
  align-items: center;
  justify-self: end;
  min-height: var(--app-control-height-action);
  min-width: 0;
  max-width: 100%;
  gap: 7px;
  padding-left: 10px;
  color: rgba(var(--v-theme-on-surface), 0.62);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-layer-muted);
  font-size: 11px;
}

.optimizer-selected-game > span {
  min-width: 0;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.optimizer-selected-game > .v-icon {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-primary));
}

.scan-error {
  margin-top: 12px;
}

.scan-error__content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.scan-error__content .v-btn {
  flex: 0 0 auto;
}

.optimizer-network {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  min-width: 0;
  gap: var(--app-space-4);
  margin-top: var(--app-space-5);
  padding: 0 8px 18px;
  border-bottom: 1px solid var(--app-border);
}

.optimizer-network h2,
.check-group h2 {
  margin: 0;
  font-size: 12px;
  font-weight: 680;
  letter-spacing: 0;
  line-height: 1.4;
}

.network__heading {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}

.network__heading span {
  color: rgba(var(--v-theme-on-surface), 0.48);
  font-size: 10px;
  line-height: 1.4;
}

.network__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(80px, 1fr));
  min-width: 0;
  gap: 0;
  margin-top: 10px;
}

.network__metrics div {
  min-width: 0;
  padding-right: 14px;
}

.network__metrics div + div {
  padding-left: 14px;
  border-left: 1px solid var(--app-border);
}

.network__metrics span,
.network__metrics b {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.network__metrics span {
  color: rgba(var(--v-theme-on-surface), 0.52);
  font-size: 10px;
  line-height: 1.35;
}

.network__metrics b {
  margin-top: 2px;
  color: rgba(var(--v-theme-on-surface), 0.88);
  font-size: 12px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  line-height: 1.35;
}

.optimizer-tabs {
  min-height: var(--app-control-height-compact);
  height: var(--app-control-height-compact);
  margin-top: var(--app-space-5);
  border-bottom: 1px solid var(--app-border);
}

.optimizer-tabs :deep(.v-slide-group__container),
.optimizer-tabs :deep(.v-slide-group__content),
.optimizer-tabs :deep(.v-tab) {
  min-height: var(--app-control-height-compact);
  height: var(--app-control-height-compact);
}

.optimizer-tabs :deep(.v-tab) {
  min-width: 0;
  gap: 6px;
  padding-inline: 10px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0;
  text-transform: none;
}

.optimizer-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 16px;
  padding-inline: 4px;
  color: rgba(var(--v-theme-on-surface), 0.56);
  border-radius: 4px;
  background: var(--app-layer-muted);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.optimizer-tabs :deep(.v-tab--selected) .optimizer-tab-count {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
}

.initial-loading {
  padding: 10px 0;
}

.scan-progress {
  margin-top: 4px;
}

.check-group {
  margin-top: var(--app-space-5);
}

.check-group h2 {
  margin-bottom: 7px;
  padding-inline: 8px;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.check-row {
  display: grid;
  grid-template-columns: 28px 22px minmax(0, 1fr) 28px;
  align-items: center;
  min-width: 0;
  min-height: 58px;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--app-border);
  transition: background-color var(--app-motion-fast) var(--app-ease-standard);
}

.check-group > .check-row:nth-child(2) {
  border-top: 1px solid var(--app-border);
}

.check-row:is(:hover, :focus-within) {
  background: var(--app-hover);
}

.check-row__select,
.check-row__action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  min-width: 28px;
}

.check-row__select :deep(.v-input) {
  --v-input-control-height: var(--app-control-height-compact);
  flex: 0 0 var(--app-control-height-compact);
}

.check-row__select :deep(.v-selection-control) {
  min-height: var(--app-control-height-compact);
}

.check-row__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.check-row__copy b {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.check-row__copy span {
  color: rgba(var(--v-theme-on-surface), 0.57);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.check-row__action .v-btn {
  opacity: 0.58;
  transition:
    color var(--app-motion-fast) var(--app-ease-standard),
    opacity var(--app-motion-fast) var(--app-ease-standard),
    background-color var(--app-motion-fast) var(--app-ease-standard);
}

.check-row:is(:hover, :focus-within) .check-row__action .v-btn {
  color: rgb(var(--v-theme-primary));
  opacity: 1;
}

.empty-filter {
  padding: 28px 8px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  text-align: center;
  font-size: 12px;
}

.notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: var(--app-space-5);
  padding: 12px 8px;
  border-top: 1px solid var(--app-border);
  border-bottom: 1px solid var(--app-border);
  color: rgba(var(--v-theme-on-surface), 0.65);
  font-size: 11px;
  line-height: 1.5;
}

.notice .v-icon {
  flex: 0 0 auto;
  margin-top: 1px;
  color: rgb(var(--v-theme-primary));
}

.optimizer-actions {
  z-index: 3;
  flex: 0 0 auto;
  border-top: 1px solid var(--app-border);
  background: rgba(var(--v-theme-background), 0.9);
  backdrop-filter: blur(18px) saturate(125%);
  -webkit-backdrop-filter: blur(18px) saturate(125%);
}

.optimizer-actions__inner {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: min(100%, var(--app-page-max-width));
  min-height: 52px;
  gap: var(--app-space-2);
  margin: 0 auto;
  padding: 10px var(--app-page-padding-x);
  box-sizing: border-box;
}

.optimizer-footer-action.v-btn {
  min-height: var(--app-control-height-action) !important;
  height: var(--app-control-height-action) !important;
  border-radius: var(--app-radius-sm) !important;
  letter-spacing: 0;
  text-transform: none;
}

@container workspace (max-width: 720px) {
  .optimizer-header {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .optimizer-header__actions {
    width: 100%;
    justify-content: flex-end;
  }

  .optimizer-overview {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 18px;
  }

  .optimizer-selected-game {
    grid-column: 1 / -1;
    justify-self: stretch;
  }

  .optimizer-network {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .optimizer-network > .v-btn {
    justify-self: end;
  }

  .network__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .network__metrics div {
    padding: 7px 12px 7px 0;
  }

  .network__metrics div:nth-child(even) {
    padding-left: 12px;
    border-left: 1px solid var(--app-border);
  }

  .network__metrics div:nth-child(odd) {
    border-left: 0;
  }

  .network__metrics div:nth-child(n + 3) {
    border-top: 1px solid var(--app-border);
  }

  .optimizer-actions__inner {
    padding-inline: 16px;
  }
}

@media (max-width: 480px) {
  .optimizer-header__actions {
    justify-content: stretch;
  }

  .optimizer-header__actions > .v-btn:last-child {
    flex: 1;
  }

  .optimizer-overview {
    grid-template-columns: 1fr;
  }

  .optimizer-score {
    justify-self: start;
  }

  .optimizer-stats {
    width: 100%;
  }

  .optimizer-stats > div {
    padding-inline: 12px;
  }

  .optimizer-stats > div:first-child {
    padding-left: 0;
    border-left: 0;
  }

  .optimizer-selected-game {
    grid-column: auto;
  }

  .optimizer-actions__inner {
    align-items: stretch;
    flex-direction: column-reverse;
    min-height: 0;
  }

  .optimizer-actions__inner .v-btn {
    width: 100%;
  }
}

@media (hover: none) {
  .check-row__action .v-btn {
    opacity: 1;
  }
}
</style>
