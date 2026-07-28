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
  try {
    const path = await open({
      multiple: false,
      filters: [{name: t('gameOptimizer.executable'), extensions: ['exe']}],
    });
    if (typeof path === 'string') {
      gamePath.value = path;
      await scan();
    }
  } catch (error) {
    toast.error(`${t('gameOptimizer.chooseGameFailed')}: ${translatedError(error)}`);
  }
}

async function clearGame() {
  gamePath.value = null;
  await scan();
}

async function runBenchmark() {
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
  try {
    await openMsSettingsPage({uri});
  } catch (error) {
    toast.error(translatedError(error));
  }
}

onMounted(() => {
  void scan();
});
</script>

<template>
  <main class="optimizer page-content">
    <header class="toolbar">
      <div class="toolbar__copy">
        <h1>{{ t('gameOptimizer.title') }}</h1>
        <p>{{ t('gameOptimizer.subtitle') }}</p>
      </div>
      <div class="toolbar__actions">
        <v-tooltip :text="t('gameOptimizer.rescan')" location="bottom">
          <template #activator="{props}">
            <v-btn
              v-bind="props"
              icon="mdi-refresh"
              variant="text"
              :loading="loading"
              :disabled="applying"
              @click="scan"
            />
          </template>
        </v-tooltip>
        <v-btn
          variant="tonal"
          prepend-icon="mdi-file-search-outline"
          :disabled="loading || applying"
          @click="chooseGame"
        >
          {{ t('gameOptimizer.chooseGame') }}
        </v-btn>
      </div>
    </header>

    <section class="summary" :aria-label="t('gameOptimizer.environmentScore')">
      <div class="score">
        <v-progress-circular
          :model-value="evaluation ? score : 0"
          :color="scoreColor"
          :size="100"
          :width="9"
        >
          <strong>{{ scoreText }}</strong>
        </v-progress-circular>
        <span>{{ t('gameOptimizer.environmentScore') }}</span>
      </div>

      <div class="stats">
        <div>
          <b>{{ evaluation?.warningCount ?? '-' }}</b>
          <span>{{ t('gameOptimizer.pending') }}</span>
        </div>
        <div>
          <b>{{ evaluation?.passCount ?? '-' }}</b>
          <span>{{ t('gameOptimizer.passed') }}</span>
        </div>
        <div>
          <b>{{ evaluation?.actionableCount ?? '-' }}</b>
          <span>{{ t('gameOptimizer.fixable') }}</span>
        </div>
      </div>

      <div v-if="gamePath" class="selected-game">
        <v-icon icon="mdi-controller" size="18" />
        <span :title="gamePath">{{ selectedGameName }}</span>
        <v-tooltip :text="t('gameOptimizer.clearGame')" location="bottom">
          <template #activator="{props}">
            <v-btn
              v-bind="props"
              icon="mdi-close"
              size="x-small"
              variant="text"
              :disabled="loading || applying"
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
        <v-btn size="small" variant="text" @click="scan">
          {{ t('gameOptimizer.rescan') }}
        </v-btn>
      </div>
    </v-alert>

    <section class="network">
      <div class="network__content">
        <div class="network__heading">
          <h2>{{ t('gameOptimizer.network.title') }}</h2>
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

    <v-tabs v-model="tab" density="compact" class="tabs">
      <v-tab value="all">{{ t('gameOptimizer.tabs.all') }}</v-tab>
      <v-tab value="warning">{{ t('gameOptimizer.tabs.warning') }}</v-tab>
      <v-tab value="pass">{{ t('gameOptimizer.tabs.pass') }}</v-tab>
    </v-tabs>

    <div v-if="loading && !evaluation" class="initial-loading">
      <v-skeleton-loader type="list-item-two-line@6" />
    </div>
    <v-progress-linear v-else-if="loading" indeterminate color="primary" class="scan-progress" />

    <template v-if="evaluation">
      <section v-for="group in groupedChecks" :key="group.category" class="check-group">
        <h2>{{ t(`gameOptimizer.categories.${group.category}`) }}</h2>
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
                  icon="mdi-open-in-new"
                  size="x-small"
                  variant="text"
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
        <v-icon icon="mdi-information-outline" size="18" />
        <span>{{ t('gameOptimizer.unavailable', {items: unavailableLabels.join(t('gameOptimizer.listSeparator'))}) }}</span>
      </div>
    </template>

    <footer class="actions">
      <v-menu>
        <template #activator="{props}">
          <v-btn v-bind="props" variant="text" prepend-icon="mdi-cog-outline" append-icon="mdi-chevron-down">
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
        color="primary"
        :disabled="selectedActions.length === 0 || applying"
        :loading="applying"
        prepend-icon="mdi-auto-fix"
        @click="applySelected"
      >
        {{ t('gameOptimizer.applySelected', {count: selectedActions.length}) }}
      </v-btn>
    </footer>
  </main>
</template>

<style scoped>
.optimizer {
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.9);
  letter-spacing: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.toolbar__copy {
  min-width: 0;
}

.toolbar__copy h1 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 650;
  letter-spacing: 0;
}

.toolbar__copy p {
  margin: 3px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.78rem;
}

.toolbar__actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
}

.summary,
.network {
  border: 1px solid rgba(var(--v-border-color), 0.14);
  border-radius: 8px;
  background: rgba(var(--v-theme-surface), 0.5);
}

.summary {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: center;
  gap: 28px;
  min-height: 132px;
  padding: 14px 16px;
}

.score {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 172px;
}

.score strong {
  font-size: 1.4rem;
}

.score span,
.stats span {
  display: block;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.75rem;
}

.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(58px, 1fr));
  gap: 22px;
}

.stats b {
  display: block;
  font-size: 1.1rem;
}

.selected-game {
  display: flex;
  align-items: center;
  justify-self: end;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.76rem;
}

.selected-game span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.network {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  min-height: 90px;
  margin-top: 12px;
  padding: 12px 16px;
}

.network h2,
.check-group h2 {
  margin: 0;
  font-size: 0.84rem;
  font-weight: 650;
  letter-spacing: 0;
}

.network__heading {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}

.network__heading span {
  color: rgba(var(--v-theme-on-surface), 0.48);
  font-size: 0.68rem;
}

.network__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(90px, 1fr));
  gap: 16px;
  margin-top: 8px;
}

.network__metrics div {
  min-width: 0;
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
  font-size: 0.7rem;
}

.network__metrics b {
  margin-top: 2px;
  font-size: 0.78rem;
  font-weight: 620;
}

.tabs {
  margin-top: 12px;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.1);
}

.initial-loading {
  padding: 8px 0;
}

.scan-progress {
  margin-top: 4px;
}

.check-group {
  margin-top: 16px;
}

.check-group h2 {
  margin-bottom: 5px;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.check-row {
  display: grid;
  grid-template-columns: 32px 24px minmax(0, 1fr) 32px;
  align-items: center;
  gap: 6px;
  min-height: 52px;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.08);
}

.check-row__select,
.check-row__action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  min-width: 32px;
}

.check-row__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.check-row__copy b,
.check-row__copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.check-row__copy b {
  font-size: 0.81rem;
  font-weight: 620;
}

.check-row__copy span {
  color: rgba(var(--v-theme-on-surface), 0.57);
  font-size: 0.73rem;
}

.empty-filter {
  padding: 28px 8px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  text-align: center;
  font-size: 0.78rem;
}

.notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 14px;
  padding: 10px;
  border-radius: 6px;
  background: rgba(var(--v-theme-primary), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.65);
  font-size: 0.75rem;
}

.actions {
  position: sticky;
  bottom: -10px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin: 20px -10px -10px;
  padding: 10px;
  border-top: 1px solid rgba(var(--v-border-color), 0.1);
  background: rgb(var(--v-theme-surface));
}

@media (max-width: 760px) {
  .toolbar {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .toolbar__actions {
    width: 100%;
    justify-content: flex-end;
  }

  .summary {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 18px;
  }

  .selected-game {
    grid-column: 1 / -1;
    justify-self: stretch;
  }

  .network {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .network > .v-btn {
    justify-self: end;
  }

  .network__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .check-row__copy span {
    overflow: visible;
    white-space: normal;
  }
}

@media (max-width: 480px) {
  .toolbar__actions {
    justify-content: stretch;
  }

  .toolbar__actions > .v-btn:last-child {
    flex: 1;
  }

  .summary {
    grid-template-columns: 1fr;
  }

  .score {
    justify-self: center;
  }

  .stats {
    width: 100%;
  }

  .selected-game {
    grid-column: auto;
  }

  .actions {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  .actions > .v-btn {
    width: 100%;
  }
}
</style>
