<script setup lang="ts">
import {computed, reactive, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useRoute} from 'vue-router';
import {useToast} from 'vue-toastification';
import AppTopBar from '@/components/AppTopBar.vue';
import {
  diagnoseAppRepairCheck,
  repairAppIssues,
  repairWindowsIconCache,
} from '@/ipc/commands.ts';
import {formatIpcError} from '@/ipc/error.ts';
import type {
  AppRepairActionResult,
  AppRepairCheckResult,
  AppRepairCheckStatus,
  AppRepairTarget,
} from '@/types/app_repair.ts';
import {
  openRepairToolWindow,
  type RepairToolTarget,
} from '@/utils/windows.ts';
import {useSettingsStore} from '@/stores/settings.ts';

type RepairPhase = 'idle' | 'scanning' | 'results' | 'repairing' | 'success';
type UiCheckStatus = AppRepairCheckStatus | 'pending' | 'checking';
type IconRepairPhase = 'idle' | 'repairing' | 'success';

interface RepairFlowState {
  phase: RepairPhase;
  currentCheckId: string | null;
  results: AppRepairCheckResult[];
  actionResults: AppRepairActionResult[];
}

interface TargetDefinition {
  icon: string;
  checks: readonly string[];
}

interface CatalogItem {
  target: RepairToolTarget;
  icon: string;
  nameKey: string;
  descriptionKey: string;
  beta?: boolean;
}

interface CatalogGroup {
  id: string;
  titleKey: string;
  subtitleKey: string;
  items: readonly CatalogItem[];
}

const {t, te} = useI18n();
const route = useRoute();
const toast = useToast();
const settingsStore = useSettingsStore();
const openingTarget = ref<RepairToolTarget | null>(null);
const iconRepairPhase = ref<IconRepairPhase>('idle');
let operationGeneration = 0;

const catalogGroups: readonly CatalogGroup[] = [
  {
    id: 'games',
    titleKey: 'appRepair.catalog.gameTitle',
    subtitleKey: 'appRepair.catalog.gameSubtitle',
    items: [
      {
        target: 'apex-launch',
        icon: 'mdi-auto-fix',
        nameKey: 'appRepair.targets.apexLaunch',
        descriptionKey: 'appRepair.catalog.apexLaunchDescription',
        beta: true,
      },
    ],
  },
  {
    id: 'applications',
    titleKey: 'appRepair.catalog.applicationTitle',
    subtitleKey: 'appRepair.catalog.applicationSubtitle',
    items: [
      {
        target: 'store',
        icon: 'mdi-store-outline',
        nameKey: 'appRepair.targets.store',
        descriptionKey: 'appRepair.catalog.storeDescription',
      },
      {
        target: 'onedrive',
        icon: 'mdi-microsoft-onedrive',
        nameKey: 'appRepair.targets.onedrive',
        descriptionKey: 'appRepair.catalog.onedriveDescription',
      },
    ],
  },
  {
    id: 'system',
    titleKey: 'appRepair.catalog.systemTitle',
    subtitleKey: 'appRepair.catalog.systemSubtitle',
    items: [
      {
        target: 'icon-cache',
        icon: 'mdi-image-refresh-outline',
        nameKey: 'appRepair.targets.iconCache',
        descriptionKey: 'appRepair.catalog.iconCacheDescription',
      },
      {
        target: 'network',
        icon: 'mdi-lan-connect',
        nameKey: 'appRepair.targets.network',
        descriptionKey: 'appRepair.catalog.networkDescription',
      },
    ],
  },
];

const visibleCatalogGroups = computed(() => catalogGroups
  .map(group => ({
    ...group,
    items: group.items.filter(item => !item.beta || settingsStore.betaFeaturesEnabled),
  }))
  .filter(group => group.items.length > 0));

const targets: Record<AppRepairTarget, TargetDefinition> = {
  store: {
    icon: 'mdi-store-outline',
    checks: [
      'store_package',
      'store_registration',
      'store_appx_services',
      'store_update_services',
      'store_cache_tool',
    ],
  },
  onedrive: {
    icon: 'mdi-microsoft-onedrive',
    checks: [
      'onedrive_installation',
      'onedrive_policy',
      'onedrive_cloud_files',
      'onedrive_process',
      'onedrive_accounts',
    ],
  },
};

function isRepairToolTarget(value: unknown): value is RepairToolTarget {
  return value === 'store'
    || value === 'onedrive'
    || value === 'icon-cache'
    || value === 'network'
    || value === 'apex-launch';
}

const repairToolTarget = computed<RepairToolTarget | null>(() => {
  const target = route.meta.repairToolTarget;
  return isRepairToolTarget(target) ? target : null;
});
const isCatalog = computed(() => repairToolTarget.value === null);
const isIconCache = computed(() => repairToolTarget.value === 'icon-cache');
const activeTarget = computed<AppRepairTarget>(() => (
  repairToolTarget.value === 'onedrive' ? 'onedrive' : 'store'
));

function newState(): RepairFlowState {
  return {
    phase: 'idle',
    currentCheckId: null,
    results: [],
    actionResults: [],
  };
}

const states = reactive<Record<AppRepairTarget, RepairFlowState>>({
  store: newState(),
  onedrive: newState(),
});

const state = computed(() => states[activeTarget.value]);
const target = computed(() => targets[activeTarget.value]);
const targetName = computed(() => t(`appRepair.targets.${activeTarget.value}`));
const isBusy = computed(() => ['scanning', 'repairing'].includes(state.value.phase));
const issueResults = computed(() => state.value.results.filter(result => (
  result.status !== 'pass'
)));
const blockedCount = computed(() => state.value.results.filter(result => (
  result.status === 'blocked'
)).length);
const requiresAdmin = computed(() => state.value.results.some(result => (
  result.repairAction && result.requiresAdmin && result.status !== 'pass'
)));
const scanProgress = computed(() => {
  if (state.value.phase !== 'scanning') return 0;
  const completed = state.value.results.length;
  const activeWeight = state.value.currentCheckId ? 0.45 : 0;
  return Math.min(100, ((completed + activeWeight) / target.value.checks.length) * 100);
});

const issueActions = computed(() => {
  const actions = new Set(
    state.value.results
      .filter(result => result.status === 'warning' || result.status === 'error')
      .map(result => result.repairAction)
      .filter((action): action is string => Boolean(action)),
  );

  if (activeTarget.value === 'onedrive' && blockedCount.value > 0) {
    return [];
  }

  if (activeTarget.value === 'store' && actions.size > 0) {
    actions.add('reset_store');
  }
  if (activeTarget.value === 'onedrive' && actions.has('enable_cldflt')) {
    actions.add('reset_onedrive');
    actions.delete('start_onedrive');
  }
  return [...actions];
});

const forceActions = computed(() => (
  activeTarget.value === 'store' ? ['reset_store'] : ['reset_onedrive']
));

const stageTitle = computed(() => {
  switch (state.value.phase) {
    case 'scanning':
      return t('appRepair.stage.scanningTitle', {target: targetName.value});
    case 'repairing':
      return t('appRepair.stage.repairingTitle', {target: targetName.value});
    case 'success':
      return t('appRepair.stage.successTitle', {target: targetName.value});
    case 'results':
      return issueResults.value.length
        ? t('appRepair.stage.issuesTitle', {count: issueResults.value.length})
        : t('appRepair.stage.healthyTitle', {target: targetName.value});
    default:
      return t('appRepair.stage.idleTitle', {target: targetName.value});
  }
});

const stageSubtitle = computed(() => {
  switch (state.value.phase) {
    case 'scanning':
      return t('appRepair.stage.scanningSubtitle', {progress: Math.round(scanProgress.value)});
    case 'repairing':
      return t('appRepair.stage.repairingSubtitle');
    case 'success':
      return state.value.actionResults.some(result => result.restartRequired)
        ? t('appRepair.stage.successRestart')
        : t('appRepair.stage.successSubtitle');
    case 'results':
      return issueResults.value.length
        ? t('appRepair.stage.issuesSubtitle', {
          repairable: issueActions.value.length,
          blocked: blockedCount.value,
        })
        : t('appRepair.stage.healthySubtitle');
    default:
      return t('appRepair.stage.idleSubtitle');
  }
});

const stageIcon = computed(() => {
  if (state.value.phase === 'success') return 'mdi-check-circle';
  if (state.value.phase === 'results' && issueResults.value.length) return 'mdi-alert-circle';
  return target.value.icon;
});

const stageColor = computed(() => {
  if (state.value.phase === 'success') return 'success';
  if (state.value.phase === 'results' && issueResults.value.length) return 'warning';
  return 'primary';
});

const statusIcons: Record<Exclude<UiCheckStatus, 'checking'>, string> = {
  pending: 'mdi-dots-horizontal-circle-outline',
  pass: 'mdi-check-circle',
  warning: 'mdi-alert-circle',
  error: 'mdi-close-circle',
  blocked: 'mdi-lock-alert',
};

const statusColors: Record<Exclude<UiCheckStatus, 'checking'>, string> = {
  pending: 'grey',
  pass: 'success',
  warning: 'warning',
  error: 'error',
  blocked: 'error',
};

const windowTargetName = computed(() => {
  if (repairToolTarget.value === 'icon-cache') return t('appRepair.targets.iconCache');
  return targetName.value;
});
const windowTitle = computed(() => (
  isIconCache.value
    ? t('windows.iconRepair.windowTitle')
    : t('appRepair.windowTitle', {target: windowTargetName.value})
));
const windowBusy = computed(() => (
  isIconCache.value ? iconRepairPhase.value === 'repairing' : isBusy.value
));
const iconRepairTitle = computed(() => {
  if (iconRepairPhase.value === 'repairing') return t('windows.iconRepair.repairingTitle');
  if (iconRepairPhase.value === 'success') return t('windows.iconRepair.successTitle');
  return t('windows.iconRepair.title');
});
const iconRepairSubtitle = computed(() => {
  if (iconRepairPhase.value === 'repairing') return t('windows.iconRepair.repairingSubtitle');
  if (iconRepairPhase.value === 'success') return t('windows.iconRepair.successSubtitle');
  return t('windows.iconRepair.description');
});

function resultFor(checkId: string): AppRepairCheckResult | undefined {
  return state.value.results.find(result => result.id === checkId);
}

function statusFor(checkId: string): UiCheckStatus {
  const result = resultFor(checkId);
  if (result) return result.status;
  if (state.value.phase === 'scanning' && state.value.currentCheckId === checkId) {
    return 'checking';
  }
  return 'pending';
}

function statusText(status: UiCheckStatus): string {
  return t(`appRepair.status.${status}`);
}

function checkTitle(checkId: string): string {
  return t(`appRepair.checks.${checkId}.title`);
}

function checkDescription(checkId: string): string {
  return t(`appRepair.checks.${checkId}.description`);
}

function checkDetail(checkId: string): string {
  const result = resultFor(checkId);
  if (!result) return checkDescription(checkId);
  const key = `appRepair.checks.${checkId}.details.${result.detailCode}`;
  return te(key) ? t(key, result.params) : checkDescription(checkId);
}

async function openCatalogTool(targetToOpen: RepairToolTarget) {
  if (openingTarget.value) return;
  openingTarget.value = targetToOpen;
  try {
    await openRepairToolWindow(targetToOpen);
  } catch (error) {
    toast.error(t('appRepair.windowOpenFailed', {message: String(error)}));
  } finally {
    openingTarget.value = null;
  }
}

async function scan() {
  const selectedTarget = activeTarget.value;
  const selectedState = states[selectedTarget];
  const generation = ++operationGeneration;
  selectedState.phase = 'scanning';
  selectedState.currentCheckId = null;
  selectedState.results = [];
  selectedState.actionResults = [];

  try {
    for (const checkId of targets[selectedTarget].checks) {
      if (generation !== operationGeneration) return;
      selectedState.currentCheckId = checkId;
      const result = await diagnoseAppRepairCheck({target: selectedTarget, checkId});
      if (generation !== operationGeneration) return;
      selectedState.results.push(result);
    }
    selectedState.currentCheckId = null;
    selectedState.phase = 'results';
  } catch (error) {
    if (generation !== operationGeneration) return;
    selectedState.currentCheckId = null;
    selectedState.phase = selectedState.results.length ? 'results' : 'idle';
    toast.error(t('appRepair.scanFailed', {message: formatIpcError(error)}));
  }
}

function cancelScan() {
  if (state.value.phase !== 'scanning') return;
  operationGeneration += 1;
  state.value.currentCheckId = null;
  state.value.phase = state.value.results.length ? 'results' : 'idle';
}

async function repair(actions: string[]) {
  if (isBusy.value || actions.length === 0) return;
  const selectedTarget = activeTarget.value;
  const selectedState = states[selectedTarget];
  const generation = ++operationGeneration;
  selectedState.phase = 'repairing';
  selectedState.actionResults = [];

  try {
    const results = await repairAppIssues({target: selectedTarget, actions});
    if (generation !== operationGeneration) return;
    selectedState.actionResults = results;
    const failed = results.filter(result => !result.success);
    if (failed.length > 0) {
      selectedState.phase = 'results';
      toast.error(t('appRepair.repairPartialFailed', {count: failed.length}));
      return;
    }
    selectedState.phase = 'success';
  } catch (error) {
    if (generation !== operationGeneration) return;
    selectedState.phase = 'results';
    toast.error(t('appRepair.repairFailed', {message: formatIpcError(error)}));
  }
}

async function repairIconCache() {
  if (iconRepairPhase.value === 'repairing') return;
  iconRepairPhase.value = 'repairing';
  try {
    await repairWindowsIconCache();
    iconRepairPhase.value = 'success';
    toast.success(t('windows.iconRepair.success'));
  } catch (error) {
    iconRepairPhase.value = 'idle';
    toast.error(formatIpcError(error));
  }
}
</script>

<template>
  <div v-if="isCatalog" class="app-page app-repair-catalog">
    <header class="app-page__header">
      <div class="app-page__heading">
        <div class="app-page__eyebrow">{{ t('appRepair.eyebrow') }}</div>
        <h1 class="app-page__title">{{ t('appRepair.title') }}</h1>
        <p class="app-page__subtitle">{{ t('appRepair.subtitle') }}</p>
      </div>
    </header>

    <div class="app-page__scroll">
      <main class="app-page__content repair-catalog-content app-reveal">
        <section
          v-for="group in visibleCatalogGroups"
          :key="group.id"
          class="repair-catalog-group"
          :aria-labelledby="`repair-catalog-group-${group.id}`"
        >
          <header class="repair-catalog-group__header">
            <div>
              <h2 :id="`repair-catalog-group-${group.id}`">{{ t(group.titleKey) }}</h2>
              <p>{{ t(group.subtitleKey) }}</p>
            </div>
          </header>

          <div class="repair-catalog-list">
            <button
              v-for="item in group.items"
              :key="item.target"
              type="button"
              class="repair-catalog-item"
              :class="{'repair-catalog-item--opening': openingTarget === item.target}"
              :disabled="openingTarget !== null"
              :aria-label="t('appRepair.catalog.open', {target: t(item.nameKey)})"
              @click="openCatalogTool(item.target)"
            >
              <span class="repair-catalog-item__icon" aria-hidden="true">
                <v-progress-circular
                  v-if="openingTarget === item.target"
                  indeterminate
                  color="primary"
                  :size="28"
                  :width="2"
                />
                <v-icon v-else :icon="item.icon" size="31" />
              </span>
              <span class="repair-catalog-item__copy">
                <span class="repair-catalog-item__title">
                  <strong>{{ t(item.nameKey) }}</strong>
                  <span
                    v-if="item.beta"
                    class="mx-beta-badge"
                    :title="t('settings.betaFeaturesHint')"
                  >{{ t('common.beta') }}</span>
                </span>
                <span class="repair-catalog-item__description">{{ t(item.descriptionKey) }}</span>
              </span>
              <v-icon
                class="repair-catalog-item__arrow"
                icon="mdi-chevron-right"
                size="18"
                aria-hidden="true"
              />
            </button>
          </div>
        </section>
      </main>
    </div>
  </div>

  <v-main v-else class="repair-window-root">
    <AppTopBar :title="windowTitle" :close-disabled="windowBusy" />
    <div class="repair-window-body">
      <main class="repair-window-content">
        <section v-if="isIconCache" class="repair-workbench icon-cache-workbench">
          <div v-if="iconRepairPhase !== 'success'" class="repair-summary">
            <div class="repair-summary__status-icon">
              <v-progress-circular
                v-if="iconRepairPhase === 'repairing'"
                indeterminate
                color="primary"
                :size="24"
                :width="2"
              />
              <v-icon v-else icon="mdi-image-refresh-outline" color="primary" size="22" />
            </div>

            <div class="repair-summary__copy">
              <h2>{{ iconRepairTitle }}</h2>
              <p>{{ iconRepairSubtitle }}</p>
            </div>

            <div class="repair-summary__actions">
              <v-btn
                class="repair-window-action"
                color="primary"
                variant="flat"
                prepend-icon="mdi-auto-fix"
                :loading="iconRepairPhase === 'repairing'"
                :disabled="iconRepairPhase === 'repairing'"
                @click="repairIconCache"
              >
                {{ t('windows.iconRepair.confirm') }}
              </v-btn>
            </div>
          </div>

          <div v-else class="repair-success">
            <v-icon icon="mdi-check-circle" color="success" size="36" />
            <h2>{{ iconRepairTitle }}</h2>
            <p>{{ iconRepairSubtitle }}</p>
            <v-btn
              class="repair-window-action"
              color="primary"
              variant="tonal"
              prepend-icon="mdi-refresh"
              @click="repairIconCache"
            >
              {{ t('windows.iconRepair.repairAgain') }}
            </v-btn>
          </div>

          <div v-if="iconRepairPhase !== 'success'" class="icon-cache-details">
            <v-alert type="warning" variant="tonal" density="compact">
              {{ t('windows.iconRepair.warning') }}
            </v-alert>
            <div class="icon-cache-scope">
              <v-icon icon="mdi-information-outline" size="18" />
              <span>{{ t('windows.iconRepair.scope') }}</span>
            </div>
          </div>

          <footer class="repair-footer">
            <v-icon icon="mdi-shield-search" size="17" />
            <span>{{ t('windows.iconRepair.safety') }}</span>
          </footer>
        </section>

        <section v-else class="repair-workbench">
          <div v-if="state.phase !== 'success'" class="repair-summary">
            <div class="repair-summary__status-icon">
              <v-progress-circular
                v-if="isBusy"
                indeterminate
                :color="stageColor"
                :size="24"
                :width="2"
              />
              <v-icon v-else :icon="stageIcon" :color="stageColor" size="22" />
            </div>

            <div class="repair-summary__copy">
              <h2>{{ stageTitle }}</h2>
              <p>{{ stageSubtitle }}</p>
            </div>

            <div class="repair-summary__actions">
              <v-btn
                v-if="state.phase === 'idle'"
                class="repair-window-action"
                color="primary"
                variant="flat"
                prepend-icon="mdi-shield-search"
                @click="scan"
              >
                {{ t('appRepair.scan') }}
              </v-btn>
              <v-btn
                v-else-if="state.phase === 'scanning'"
                class="repair-window-action"
                variant="tonal"
                prepend-icon="mdi-close"
                @click="cancelScan"
              >
                {{ t('appRepair.cancel') }}
              </v-btn>
              <template v-else-if="state.phase === 'results'">
                <v-btn
                  class="repair-window-action"
                  variant="text"
                  prepend-icon="mdi-refresh"
                  @click="scan"
                >
                  {{ t('appRepair.rescan') }}
                </v-btn>
                <v-btn
                  v-if="issueActions.length"
                  class="repair-window-action"
                  color="primary"
                  variant="flat"
                  prepend-icon="mdi-auto-fix"
                  @click="repair(issueActions)"
                >
                  {{ t('appRepair.repairNow') }}
                </v-btn>
                <v-btn
                  v-else-if="issueResults.length === 0"
                  class="repair-window-action"
                  color="primary"
                  variant="tonal"
                  prepend-icon="mdi-auto-fix"
                  @click="repair(forceActions)"
                >
                  {{ t('appRepair.forceRepair') }}
                </v-btn>
              </template>
            </div>
          </div>

          <v-progress-linear
            v-if="state.phase === 'scanning'"
            :model-value="scanProgress"
            color="primary"
            height="3"
          />
          <v-progress-linear
            v-else-if="state.phase === 'repairing'"
            indeterminate
            color="primary"
            height="3"
          />

          <div v-if="state.phase !== 'success'" class="repair-checks">
            <div
              v-for="checkId in target.checks"
              :key="checkId"
              class="repair-check"
              :class="`repair-check--${statusFor(checkId)}`"
            >
              <div class="repair-check__copy">
                <strong>{{ checkTitle(checkId) }}</strong>
                <span>{{ checkDetail(checkId) }}</span>
              </div>

              <div class="repair-check__meta">
                <span
                  v-if="resultFor(checkId)?.requiresAdmin && statusFor(checkId) !== 'pass'"
                  class="repair-check__admin"
                >
                  {{ t('appRepair.admin') }}
                </span>

                <div class="repair-check__status" :aria-label="statusText(statusFor(checkId))">
                  <v-progress-circular
                    v-if="statusFor(checkId) === 'checking'"
                    indeterminate
                    color="primary"
                    :size="16"
                    :width="2"
                  />
                  <v-icon
                    v-else
                    :icon="statusIcons[statusFor(checkId) as Exclude<UiCheckStatus, 'checking'>]"
                    :color="statusColors[statusFor(checkId) as Exclude<UiCheckStatus, 'checking'>]"
                    size="17"
                  />
                  <span>{{ statusText(statusFor(checkId)) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="repair-success">
            <v-icon icon="mdi-check-circle" color="success" size="36" />
            <h2>{{ stageTitle }}</h2>
            <p>{{ stageSubtitle }}</p>
            <v-btn
              class="repair-window-action"
              color="primary"
              variant="flat"
              prepend-icon="mdi-shield-search"
              @click="scan"
            >
              {{ t('appRepair.verify') }}
            </v-btn>
          </div>

          <footer class="repair-footer">
            <v-icon icon="mdi-information-outline" size="17" />
            <div>
              <span>{{ t(`appRepair.safety.${activeTarget}`) }}</span>
              <small v-if="requiresAdmin && state.phase !== 'success'">
                {{ t('appRepair.adminHint') }}
              </small>
              <small v-else-if="state.phase === 'results' && issueResults.length === 0">
                {{ t('appRepair.forceHint') }}
              </small>
            </div>
          </footer>
        </section>
      </main>
    </div>
  </v-main>
</template>

<style scoped>
.repair-catalog-group {
  min-width: 0;
}

.repair-catalog-group + .repair-catalog-group {
  margin-top: var(--app-space-6);
  padding-top: 21px;
  border-top: 1px solid var(--app-border);
}

.repair-catalog-group__header {
  display: flex;
  align-items: flex-start;
  padding: 0 2px 12px;
}

.repair-catalog-group__header h2 {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 14px;
  font-weight: 680;
  line-height: 1.35;
}

.repair-catalog-group__header p {
  margin: 4px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 11px;
  line-height: 1.45;
}

.repair-catalog-list {
  border-top: 1px solid var(--app-border);
  border-bottom: 1px solid var(--app-border);
}

.repair-catalog-item {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 18px;
  align-items: center;
  width: 100%;
  min-width: 0;
  min-height: 88px;
  gap: 14px;
  padding: 12px 8px;
  color: inherit;
  border: 0;
  border-radius: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    color var(--app-motion-fast) var(--app-ease-standard),
    background-color var(--app-motion-fast) var(--app-ease-standard);
}

.repair-catalog-item + .repair-catalog-item {
  border-top: 1px solid var(--app-border);
}

.repair-catalog-item:hover:not(:disabled) {
  background: var(--app-hover);
}

.repair-catalog-item:focus-visible {
  z-index: 1;
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
  background: rgba(var(--v-theme-primary), 0.055);
}

.repair-catalog-item:active:not(:disabled) {
  background: rgba(var(--v-theme-primary), 0.085);
}

.repair-catalog-item:disabled {
  cursor: wait;
  opacity: 0.62;
}

.repair-catalog-item--opening:disabled {
  opacity: 1;
  background: rgba(var(--v-theme-primary), 0.055);
}

.repair-catalog-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  color: rgba(var(--v-theme-on-surface), 0.72);
  border: 1px solid var(--app-border);
  border-radius: 7px;
  background: var(--app-layer-muted);
  transition:
    color var(--app-motion-fast) var(--app-ease-standard),
    border-color var(--app-motion-fast) var(--app-ease-standard),
    background-color var(--app-motion-fast) var(--app-ease-standard);
}

.repair-catalog-item:is(:hover, :focus-visible) .repair-catalog-item__icon {
  color: rgb(var(--v-theme-primary));
  border-color: rgba(var(--v-theme-primary), 0.34);
  background: rgba(var(--v-theme-primary), 0.1);
}

.repair-catalog-item--opening .repair-catalog-item__icon {
  color: rgb(var(--v-theme-primary));
  border-color: rgba(var(--v-theme-primary), 0.34);
  background: rgba(var(--v-theme-primary), 0.1);
}

.repair-catalog-item__copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.repair-catalog-item__title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.repair-catalog-item__copy strong {
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.4;
}

.repair-catalog-item__description {
  max-width: 720px;
  margin-top: 4px;
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-size: 12px;
  line-height: 1.5;
}

.repair-catalog-item__arrow {
  color: rgba(var(--v-theme-on-surface), 0.3);
  transition: color var(--app-motion-fast) var(--app-ease-standard);
}

.repair-catalog-item:hover:not(:disabled) .repair-catalog-item__arrow,
.repair-catalog-item:focus-visible .repair-catalog-item__arrow {
  color: rgb(var(--v-theme-primary));
}

.repair-window-root {
  display: flex;
  flex-flow: column;
  height: 100vh;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.9);
  background: rgb(var(--v-theme-background));
  letter-spacing: 0;
}

.repair-window-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.repair-window-content {
  display: flex;
  flex-direction: column;
  width: min(100%, 900px);
  height: 100%;
  min-height: 0;
  margin: 0 auto;
  padding: 14px 18px 16px;
  box-sizing: border-box;
}

.repair-workbench {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-layer-raised);
}

.repair-summary {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  flex: 0 0 auto;
  min-height: 72px;
  gap: 12px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--app-border);
}

.repair-summary__status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
}

.repair-summary__copy {
  min-width: 0;
}

.repair-summary__copy h2 {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 13px;
  font-weight: 680;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.repair-summary__copy p {
  margin: 2px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.repair-summary__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
}

.repair-window-action.v-btn {
  min-height: var(--app-control-height-action) !important;
  height: var(--app-control-height-action) !important;
  padding-inline: 11px !important;
  border-radius: var(--app-radius-sm) !important;
  letter-spacing: 0;
  text-transform: none;
}

.repair-workbench > .v-progress-linear {
  flex: 0 0 auto;
}

.repair-checks {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.repair-check {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  min-width: 0;
  min-height: 58px;
  gap: 12px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--app-border);
  transition: background-color var(--app-motion-fast) var(--app-ease-standard);
}

.repair-check:last-child {
  border-bottom: 0;
}

.repair-check--checking {
  background: rgba(var(--v-theme-primary), 0.045);
}

.repair-check--warning,
.repair-check--blocked {
  background: rgba(var(--v-theme-warning), 0.03);
}

.repair-check--error {
  background: rgba(var(--v-theme-error), 0.03);
}

.repair-check__copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.repair-check__copy strong {
  color: rgba(var(--v-theme-on-surface), 0.88);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.repair-check__copy span {
  margin-top: 2px;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.repair-check__meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
  gap: 8px;
}

.repair-check__admin {
  padding: 2px 6px;
  color: rgba(var(--v-theme-warning), 0.92);
  font-size: 9px;
  font-weight: 700;
  border: 1px solid rgba(var(--v-theme-warning), 0.25);
  border-radius: var(--app-radius-sm);
  background: rgba(var(--v-theme-warning), 0.07);
  white-space: nowrap;
}

.repair-check__status {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 90px;
  gap: 6px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
}

.repair-check--pass .repair-check__status {
  color: rgb(var(--v-theme-success));
}

.repair-check--warning .repair-check__status {
  color: rgb(var(--v-theme-warning));
}

.repair-check--error .repair-check__status,
.repair-check--blocked .repair-check__status {
  color: rgb(var(--v-theme-error));
}

.repair-success {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  padding: 28px 24px;
  text-align: center;
}

.repair-success h2 {
  margin: 12px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 15px;
  font-weight: 680;
  line-height: 1.4;
}

.repair-success p {
  max-width: 500px;
  margin: 5px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.repair-success .repair-window-action {
  margin-top: 16px;
}

.icon-cache-details {
  display: grid;
  align-content: start;
  flex: 1 1 auto;
  min-height: 0;
  gap: 12px;
  padding: 14px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.icon-cache-details :deep(.v-alert) {
  border-radius: var(--app-radius-sm);
  font-size: 11px;
  line-height: 1.5;
}

.icon-cache-scope {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 11px;
  line-height: 1.55;
}

.icon-cache-scope .v-icon {
  flex: 0 0 auto;
  margin-top: 1px;
}

.repair-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  gap: 8px;
  min-height: 46px;
  padding: 9px 14px 10px;
  color: rgba(var(--v-theme-on-surface), 0.52);
  border-top: 1px solid var(--app-border);
  background: rgba(var(--v-theme-on-surface), 0.02);
  font-size: 11px;
  line-height: 1.5;
}

.repair-footer > .v-icon {
  flex: 0 0 auto;
  margin-top: 1px;
}

.repair-footer > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.repair-footer small {
  color: rgb(var(--v-theme-warning));
  font-size: 10px;
}

@media (hover: hover) {
  .repair-check:hover {
    background: var(--app-hover);
  }

  .repair-check--checking:hover {
    background: rgba(var(--v-theme-primary), 0.065);
  }
}

@media (max-width: 720px) {
  .repair-window-content {
    padding: 12px 14px 14px;
  }

  .repair-summary {
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 12px;
    padding-inline: 12px;
  }

  .repair-summary__actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }

  .repair-check,
  .repair-footer,
  .icon-cache-details {
    padding-inline: 12px;
  }
}

@media (max-width: 600px) {
  .repair-window-content {
    padding: 10px;
  }

  .repair-summary__actions {
    align-items: stretch;
    flex-direction: column;
  }

  .repair-summary__actions .v-btn {
    width: 100%;
  }

  .repair-check {
    align-items: flex-start;
    grid-template-columns: 1fr;
    gap: 7px;
  }

  .repair-check__meta {
    justify-content: flex-start;
    width: 100%;
  }
}
</style>
