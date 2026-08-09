<script setup lang="ts">
import {computed, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import AppTopBar from '@/components/AppTopBar.vue';
import {formatIpcError} from '@/ipc/error.ts';
import {diagnoseNetworkRepairCheck, repairNetwork} from '@/ipc/commands.ts';
import type {
  NetworkRepairCheck,
  NetworkRepairCheckStatus,
} from '@/types/network_repair.ts';
import {
  INITIAL_NETWORK_REPAIR_PHASE,
  NETWORK_REPAIR_CHECK_IDS,
  networkRepairLoadFailurePhase,
  networkRepairLoadPhase,
  type NetworkRepairPhase,
} from '@/utils/network-repair-state.ts';

type NetworkRepairUiStatus = NetworkRepairCheckStatus | 'pending' | 'checking';

const {locale, t, te} = useI18n();
const toast = useToast();
const phase = ref<NetworkRepairPhase>(INITIAL_NETWORK_REPAIR_PHASE);
const results = ref<NetworkRepairCheck[]>([]);
const checkedAtMs = ref<number | null>(null);
const currentCheckId = ref<string | null>(null);
const completedCheckCount = ref(0);
const selectedActions = ref<string[]>([]);

const hasReport = computed(() => checkedAtMs.value !== null);
const isBusy = computed(() => ['scanning', 'refreshing', 'repairing'].includes(phase.value));
const availableActions = computed(() => {
  const actions = new Set<string>();
  for (const check of results.value) {
    for (const action of check.repairActions) actions.add(action);
  }
  return [...actions];
});
const recommendedActions = computed(() => availableActions.value.filter(action => (
  !['reset_winsock', 'reset_tcpip'].includes(action)
)));
const issueCount = computed(() => results.value.filter(check => check.status !== 'pass').length);
const hasProxyIssue = computed(() => results.value.some(check => (
  check.id === 'proxy_environment' && check.status !== 'pass'
)));
const selectedNeedsAdmin = computed(() => selectedActions.value.some(action => (
  results.value.some(check => check.requiresAdmin && check.repairActions.includes(action))
)));
const lastChecked = computed(() => {
  if (checkedAtMs.value === null) return '';
  return new Intl.DateTimeFormat(locale.value, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(checkedAtMs.value));
});
const currentCheckNumber = computed(() => {
  const index = NETWORK_REPAIR_CHECK_IDS.findIndex(checkId => checkId === currentCheckId.value);
  return index >= 0 ? index + 1 : Math.min(
    completedCheckCount.value + 1,
    NETWORK_REPAIR_CHECK_IDS.length,
  );
});
const scanProgress = computed(() => {
  if (phase.value !== 'scanning' && phase.value !== 'refreshing') return 0;
  return (completedCheckCount.value / NETWORK_REPAIR_CHECK_IDS.length) * 100;
});

const stageTitle = computed(() => {
  switch (phase.value) {
    case 'scanning':
      return t('networkRepair.stage.scanningTitle');
    case 'refreshing':
      return t('networkRepair.stage.refreshingTitle');
    case 'repairing':
      return t('networkRepair.stage.repairingTitle');
    case 'ready':
      return issueCount.value > 0
        ? t('networkRepair.stage.issuesTitle', {count: issueCount.value})
        : t('networkRepair.stage.healthyTitle');
    default:
      return t('networkRepair.stage.idleTitle');
  }
});

const stageSubtitle = computed(() => {
  switch (phase.value) {
    case 'scanning':
      return t('networkRepair.stage.scanningSubtitle', {
        current: currentCheckNumber.value,
        total: NETWORK_REPAIR_CHECK_IDS.length,
        check: currentCheckId.value ? checkTitle(currentCheckId.value) : '',
      });
    case 'refreshing':
      return t('networkRepair.stage.refreshingSubtitle', {
        current: currentCheckNumber.value,
        total: NETWORK_REPAIR_CHECK_IDS.length,
        check: currentCheckId.value ? checkTitle(currentCheckId.value) : '',
      });
    case 'repairing':
      return t('networkRepair.stage.repairingSubtitle');
    case 'ready':
      return t('networkRepair.summary', {
        count: results.value.length,
        issues: issueCount.value,
      });
    default:
      return t('networkRepair.stage.idleSubtitle');
  }
});

const stageIcon = computed(() => {
  if (phase.value === 'ready' && issueCount.value > 0) return 'mdi-alert-circle';
  if (phase.value === 'ready') return 'mdi-check-circle';
  return 'mdi-lan-connect';
});

const stageColor = computed(() => {
  if (phase.value === 'ready' && issueCount.value > 0) return 'warning';
  if (phase.value === 'ready') return 'success';
  return 'primary';
});

const statusIcon: Record<Exclude<NetworkRepairUiStatus, 'checking'>, string> = {
  pending: 'mdi-dots-horizontal-circle-outline',
  pass: 'mdi-check-circle',
  warning: 'mdi-alert-circle',
  error: 'mdi-close-circle',
};
const statusColor: Record<Exclude<NetworkRepairUiStatus, 'checking'>, string> = {
  pending: 'grey',
  pass: 'success',
  warning: 'warning',
  error: 'error',
};

function actionLabel(action: string): string {
  const key = `networkRepair.actions.${action}`;
  return te(key) ? t(key) : action;
}

function resultFor(checkId: string): NetworkRepairCheck | undefined {
  return results.value.find(result => result.id === checkId);
}

function statusFor(checkId: string): NetworkRepairUiStatus {
  if (currentCheckId.value === checkId) return 'checking';
  return resultFor(checkId)?.status ?? 'pending';
}

function statusText(status: NetworkRepairUiStatus): string {
  return t(`networkRepair.status.${status}`);
}

function statusIconFor(checkId: string): string {
  const status = statusFor(checkId);
  return status === 'checking' ? '' : statusIcon[status];
}

function statusColorFor(checkId: string): string {
  const status = statusFor(checkId);
  return status === 'checking' ? 'primary' : statusColor[status];
}

function checkTitle(checkId: string): string {
  const key = `networkRepair.checks.${checkId}.title`;
  return te(key) ? t(key) : checkId;
}

function checkDetail(check: NetworkRepairCheck): string {
  const key = `networkRepair.checks.${check.id}.details.${check.detailCode}`;
  return te(key) ? t(key, check.params) : check.detailCode;
}

function rowDetail(checkId: string): string {
  const status = statusFor(checkId);
  if (status === 'checking' || status === 'pending') return statusText(status);
  const result = resultFor(checkId);
  return result ? checkDetail(result) : statusText('pending');
}

function selectRecommended() {
  selectedActions.value = [...recommendedActions.value];
}

function needsConfirmation(action: string): boolean {
  return ['clear_machine_proxy', 'reset_winsock', 'reset_tcpip'].includes(action);
}

async function refreshStatus() {
  if (phase.value === 'scanning' || phase.value === 'refreshing') return;
  const hadReport = hasReport.value;
  phase.value = networkRepairLoadPhase(hadReport);
  currentCheckId.value = null;
  completedCheckCount.value = 0;
  if (!hadReport) results.value = [];
  try {
    for (const checkId of NETWORK_REPAIR_CHECK_IDS) {
      currentCheckId.value = checkId;
      const result = await diagnoseNetworkRepairCheck(checkId);
      const nextResults = results.value.filter(item => item.id !== checkId);
      nextResults.push(result);
      results.value = nextResults;
      completedCheckCount.value += 1;
    }
    currentCheckId.value = null;
    checkedAtMs.value = Date.now();
    selectedActions.value = [];
    phase.value = 'ready';
  } catch (error) {
    currentCheckId.value = null;
    phase.value = networkRepairLoadFailurePhase(hadReport);
    toast.error(formatIpcError(error));
  }
}

async function repair() {
  if (selectedActions.value.length === 0 || isBusy.value) return;
  const selected = [...selectedActions.value];
  if (selected.some(needsConfirmation)) {
    const confirmed = window.confirm(t('networkRepair.confirmBody', {
      actions: selected.map(actionLabel).join(t('networkRepair.actionSeparator')),
    }));
    if (!confirmed) return;
  }

  phase.value = 'repairing';
  try {
    const results = await repairNetwork(selected);
    const failed = results.filter(result => !result.success);
    if (failed.length) {
      toast.warning(t('networkRepair.repairPartial', {count: failed.length}));
    } else {
      toast.success(t('networkRepair.repairSuccess'));
    }
    if (results.some(result => result.restartRequired)) {
      toast.info(t('networkRepair.restartRequired'));
    }
  } catch (error) {
    phase.value = 'ready';
    toast.error(formatIpcError(error));
    return;
  }

  await refreshStatus();
}
</script>

<template>
  <v-main class="network-repair-window">
    <AppTopBar
      :title="t('networkRepair.windowTitle')"
      :close-disabled="isBusy"
    />

    <div class="network-repair-window__body">
      <main class="network-repair-window__content">
        <section
          class="network-repair-workbench"
          :aria-label="t('networkRepair.title')"
        >
          <div
            class="network-repair-summary"
            :aria-busy="isBusy"
          >
            <div
              class="network-repair-summary__status-icon"
              aria-hidden="true"
            >
              <v-icon :icon="stageIcon" :color="stageColor" size="20" />
            </div>

            <div class="network-repair-summary__copy" aria-live="polite">
              <h2>{{ stageTitle }}</h2>
              <p>{{ stageSubtitle }}</p>
              <small v-if="hasReport">
                {{ t('networkRepair.lastChecked', {time: lastChecked}) }}
              </small>
            </div>

            <div class="network-repair-summary__actions">
              <v-btn
                v-if="phase === 'idle'"
                class="network-repair-action"
                size="small"
                color="primary"
                variant="flat"
                prepend-icon="mdi-shield-search"
                @click="refreshStatus"
              >
                {{ t('networkRepair.startCheck') }}
              </v-btn>

              <template v-else-if="hasReport">
                <v-btn
                  class="network-repair-action"
                  size="small"
                  variant="text"
                  prepend-icon="mdi-refresh"
                  :loading="phase === 'refreshing'"
                  :disabled="isBusy"
                  @click="refreshStatus"
                >
                  {{ t('networkRepair.refresh') }}
                </v-btn>
                <v-btn
                  v-if="availableActions.length"
                  class="network-repair-action"
                  size="small"
                  variant="tonal"
                  prepend-icon="mdi-check-circle"
                  :disabled="isBusy"
                  @click="selectRecommended"
                >
                  {{ t('networkRepair.selectRecommended') }}
                </v-btn>
                <v-btn
                  v-if="availableActions.length"
                  class="network-repair-action"
                  size="small"
                  color="primary"
                  variant="flat"
                  prepend-icon="mdi-auto-fix"
                  :loading="phase === 'repairing'"
                  :disabled="selectedActions.length === 0 || isBusy"
                  @click="repair"
                >
                  {{ t('networkRepair.repair') }}
                </v-btn>
              </template>
            </div>
          </div>

          <v-progress-linear
            v-if="phase === 'scanning' || phase === 'refreshing'"
            class="network-repair-progress"
            :model-value="scanProgress"
            color="primary"
            height="3"
          />
          <v-progress-linear
            v-else-if="phase === 'repairing'"
            class="network-repair-progress"
            indeterminate
            color="primary"
            height="3"
          />

          <div v-if="phase !== 'idle'" class="network-repair-results-meta">
            <v-alert
              v-if="hasProxyIssue"
              class="network-repair-notice"
              type="warning"
              variant="tonal"
              density="compact"
              icon="mdi-alert-circle"
            >
              {{ t('networkRepair.proxyWarning') }}
            </v-alert>
            <div v-if="selectedNeedsAdmin" class="network-repair-admin-hint">
              <v-icon icon="mdi-lock-alert" size="17" />
              <span>{{ t('networkRepair.adminHint') }}</span>
            </div>
          </div>

          <div
            class="network-repair-checks"
            role="list"
            :aria-label="t('networkRepair.title')"
          >
            <div
              v-for="checkId in NETWORK_REPAIR_CHECK_IDS"
              :key="checkId"
              class="network-repair-check"
              :class="`network-repair-check--${statusFor(checkId)}`"
              role="listitem"
              :aria-busy="statusFor(checkId) === 'checking'"
            >
              <div
                class="network-repair-check__indicator"
                :aria-label="statusText(statusFor(checkId))"
              >
                <v-progress-circular
                  v-if="statusFor(checkId) === 'checking'"
                  indeterminate
                  color="primary"
                  :size="19"
                  :width="2"
                  aria-hidden="true"
                />
                <v-icon
                  v-else
                  :color="statusColorFor(checkId)"
                  :icon="statusIconFor(checkId)"
                  size="19"
                  aria-hidden="true"
                />
              </div>

              <div class="network-repair-check__copy">
                <strong>{{ checkTitle(checkId) }}</strong>
                <span v-if="resultFor(checkId) && statusFor(checkId) !== 'checking'">
                  {{ rowDetail(checkId) }}
                </span>
              </div>

              <div
                v-if="hasReport
                  && statusFor(checkId) !== 'checking'
                  && (resultFor(checkId)?.repairActions.length ?? 0) > 0"
                class="network-repair-check__actions"
              >
                <v-checkbox
                  v-for="action in resultFor(checkId)?.repairActions ?? []"
                  :key="action"
                  v-model="selectedActions"
                  :value="action"
                  hide-details
                  density="compact"
                  :disabled="isBusy"
                  :label="actionLabel(action)"
                  :aria-label="actionLabel(action)"
                />
              </div>
              <span v-else class="network-repair-check__status">
                {{ statusText(statusFor(checkId)) }}
              </span>
            </div>
          </div>

          <footer class="network-repair-footer">
            <v-icon icon="mdi-information-outline" size="17" />
            <span>{{ t('networkRepair.safety') }}</span>
          </footer>
        </section>
      </main>
    </div>
  </v-main>
</template>

<style scoped>
.network-repair-window {
  display: flex;
  flex-flow: column;
  height: 100vh;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.9);
  background: rgb(var(--v-theme-background));
  letter-spacing: 0;
}

.network-repair-window__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.network-repair-window__content {
  display: flex;
  flex-direction: column;
  width: min(100%, 900px);
  height: 100%;
  min-height: 0;
  margin: 0 auto;
  padding: 14px 18px 16px;
  box-sizing: border-box;
}

.network-repair-workbench {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-layer-raised);
}

.network-repair-summary {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  flex: 0 0 auto;
  min-height: 72px;
  gap: 12px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--app-border);
}

.network-repair-summary__status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
}

.network-repair-summary__copy {
  min-width: 0;
}

.network-repair-summary__copy h2 {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 13px;
  font-weight: 680;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.network-repair-summary__copy p {
  margin: 2px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.network-repair-summary__copy small {
  display: block;
  margin-top: 3px;
  color: rgba(var(--v-theme-on-surface), 0.44);
  font-size: 10px;
  line-height: 1.4;
}

.network-repair-summary__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 6px;
}

.network-repair-action.v-btn {
  min-height: var(--app-control-height-action) !important;
  height: var(--app-control-height-action) !important;
  padding-inline: 11px !important;
  border-radius: var(--app-radius-sm) !important;
  letter-spacing: 0;
  text-transform: none;
}

.network-repair-progress {
  flex: 0 0 auto;
}

.network-repair-results-meta {
  display: grid;
  flex: 0 0 auto;
  gap: 8px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--app-border);
}

.network-repair-results-meta:empty {
  display: none;
}

.network-repair-notice {
  border-radius: var(--app-radius-sm);
  font-size: 11px;
  line-height: 1.5;
}

.network-repair-admin-hint {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 11px;
  line-height: 1.5;
}

.network-repair-admin-hint .v-icon {
  flex: 0 0 auto;
  margin-top: 1px;
}

.network-repair-checks {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.network-repair-check {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) minmax(112px, auto);
  align-items: center;
  min-width: 0;
  min-height: 54px;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--app-border);
  transition: background-color var(--app-motion-fast) var(--app-ease-standard);
}

.network-repair-check:last-child {
  border-bottom: 0;
}

.network-repair-check--checking {
  background: rgba(var(--v-theme-primary), 0.045);
}

.network-repair-check__indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  min-width: 22px;
}

.network-repair-check--pending .network-repair-check__indicator,
.network-repair-check--pending .network-repair-check__status {
  color: rgba(var(--v-theme-on-surface), 0.42);
}

.network-repair-check__copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.network-repair-check__copy strong {
  color: rgba(var(--v-theme-on-surface), 0.88);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.network-repair-check__copy span {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.network-repair-check__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  min-width: 0;
  max-width: 360px;
  gap: 0 8px;
}

.network-repair-check__actions :deep(.v-input) {
  --v-input-control-height: var(--app-control-height-compact);
  flex: 0 0 auto;
}

.network-repair-check__actions :deep(.v-selection-control) {
  min-height: var(--app-control-height-compact);
}

.network-repair-check__actions :deep(.v-label) {
  font-size: 11px;
  line-height: 1.35;
}

.network-repair-check__status {
  justify-self: end;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
}

.network-repair-footer {
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

.network-repair-footer .v-icon {
  flex: 0 0 auto;
  margin-top: 1px;
}

@media (hover: hover) {
  .network-repair-check:hover {
    background: var(--app-hover);
  }

  .network-repair-check--checking:hover {
    background: rgba(var(--v-theme-primary), 0.065);
  }
}

@media (max-width: 820px) {
  .network-repair-window__content {
    padding: 12px 14px 14px;
  }

  .network-repair-summary {
    grid-template-columns: 24px minmax(0, 1fr);
    padding-inline: 12px;
  }

  .network-repair-summary__actions {
    grid-column: 1 / -1;
  }

  .network-repair-results-meta,
  .network-repair-check,
  .network-repair-footer {
    padding-inline: 12px;
  }

  .network-repair-check {
    grid-template-columns: 22px minmax(0, 1fr);
  }

  .network-repair-check__actions,
  .network-repair-check__status {
    grid-column: 2;
    justify-self: start;
  }

  .network-repair-check__actions {
    justify-content: flex-start;
    max-width: none;
  }
}

@media (max-width: 520px) {
  .network-repair-window__content {
    padding: 10px;
  }

  .network-repair-summary__actions {
    align-items: stretch;
    flex-direction: column;
  }

  .network-repair-summary__actions .v-btn {
    width: 100%;
  }
}
</style>
