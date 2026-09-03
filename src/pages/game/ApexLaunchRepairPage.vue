<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue';
import {getCurrentWindow} from '@tauri-apps/api/window';
import type {UnlistenFn} from '@tauri-apps/api/event';
import {openUrl} from '@tauri-apps/plugin-opener';
import {useRoute} from 'vue-router';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import AppTopBar from '@/components/AppTopBar.vue';
import ApexLauncherUser from '@/components/game/apex/ApexLauncherUser.vue';
import {
  diagnoseApexLaunchRepairCheck,
  repairApexLaunchIssues,
} from '@/ipc/commands.ts';
import {formatIpcError} from '@/ipc/error.ts';
import {useApexStore} from '@/stores/game/apex.ts';
import type {
  ApexLaunchRepairAction,
  ApexLaunchRepairActionResult,
  ApexLaunchRepairCheckResult,
  ApexLaunchRepairCheckStatus,
  ApexLaunchRepairTarget,
} from '@/types/apex_launch_repair.ts';
import {
  APEX_LAUNCH_REPAIR_CHECK_IDS,
  apexLaunchRepairLoadFailurePhase,
  apexLaunchRepairLoadPhase,
  INITIAL_APEX_LAUNCH_REPAIR_PHASE,
  type ApexLaunchRepairPhase,
} from '@/utils/apex-launch-repair-state.ts';
import {
  emitApexConfigChanged,
  listenApexLaunchRepairAccount,
} from '@/utils/game/apex_config_events.ts';
import {startTauriStoreOnce} from '@/utils/tauri_store.ts';
import {openRepairToolWindow} from '@/utils/windows.ts';

type TauriRuntimeWindow = Window & {__TAURI_INTERNALS__?: unknown};
const isTauriRuntime = typeof window !== 'undefined'
  && Boolean((window as TauriRuntimeWindow).__TAURI_INTERNALS__);

type UiStatus = ApexLaunchRepairCheckStatus | 'pending' | 'checking';
type ExternalActionId =
  | 'open_game_repair'
  | 'open_launcher_cache'
  | 'open_runtime_help'
  | 'open_server_status'
  | 'open_gpu_vendor_help';

const route = useRoute();
const {locale, t, te} = useI18n();
const toast = useToast();
const apexStore = useApexStore();

const ready = ref(false);
const accountLoadError = ref<string | null>(null);
const phase = ref<ApexLaunchRepairPhase>(INITIAL_APEX_LAUNCH_REPAIR_PHASE);
const results = ref<ApexLaunchRepairCheckResult[]>([]);
const workingResults = ref<ApexLaunchRepairCheckResult[]>([]);
const actionResults = ref<ApexLaunchRepairActionResult[]>([]);
const selectedActions = ref<string[]>([]);
const checkedAtMs = ref<number | null>(null);
const currentCheckId = ref<string | null>(null);
const completedCheckCount = ref(0);
const resetDialog = ref(false);
const resettingConfig = ref(false);
const externalDialogAction = ref<ExternalActionId | null>(null);
let operationGeneration = 0;
let initializeGeneration = 0;
let unlistenAccount: UnlistenFn | null = null;
let unlistenClose: (() => void) | null = null;

const requestedRouteAccount = typeof route.query.account === 'string'
  ? route.query.account
  : null;

const accountKey = computed(() => apexStore.launcher_selection_key);
const activeAccount = computed(() => apexStore.active_apex_account);
const target = computed<ApexLaunchRepairTarget | null>(() => {
  if (!isTauriRuntime) return {launcher: 'steam', accountId: 'browser-preview'};
  const account = activeAccount.value;
  if (!account) return null;
  return {launcher: account.kind, accountId: account.user.id};
});
const hasReport = computed(() => checkedAtMs.value !== null);
const isBusy = computed(() => ['scanning', 'refreshing', 'repairing'].includes(phase.value));
const visibleResults = computed(() => (
  phase.value === 'scanning' ? workingResults.value : results.value
));
const issueCount = computed(() => results.value.filter(result => (
  result.status === 'warning' || result.status === 'error'
)).length);
const availableBatchActions = computed(() => {
  const byId = new Map<string, ApexLaunchRepairAction>();
  for (const result of results.value) {
    for (const action of result.actions) {
      if (action.mode === 'batch') byId.set(action.id, action);
    }
  }
  return [...byId.values()];
});
const recommendedActions = computed(() => availableBatchActions.value
  .filter(action => action.recommended)
  .map(action => action.id));
const selectedNeedsAdmin = computed(() => availableBatchActions.value.some(action => (
  action.requiresAdmin && selectedActions.value.includes(action.id)
)));
const selectedNeedsRestart = computed(() => availableBatchActions.value.some(action => (
  action.restartRequired && selectedActions.value.includes(action.id)
)));
const successfulActionCount = computed(() => actionResults.value.filter(result => result.success).length);
const failedActionCount = computed(() => actionResults.value.filter(result => !result.success).length);
const restartRequired = computed(() => actionResults.value.some(result => (
  result.success && result.restartRequired
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
  const index = APEX_LAUNCH_REPAIR_CHECK_IDS.findIndex(id => id === currentCheckId.value);
  return index >= 0 ? index + 1 : Math.min(
    completedCheckCount.value + 1,
    APEX_LAUNCH_REPAIR_CHECK_IDS.length,
  );
});
const scanProgress = computed(() => {
  if (phase.value !== 'scanning' && phase.value !== 'refreshing') return 0;
  return (completedCheckCount.value / APEX_LAUNCH_REPAIR_CHECK_IDS.length) * 100;
});
const stageTitle = computed(() => {
  if (!target.value) return t('apexLaunchRepair.stage.accountRequiredTitle');
  switch (phase.value) {
    case 'scanning': return t('apexLaunchRepair.stage.scanningTitle');
    case 'refreshing': return t('apexLaunchRepair.stage.refreshingTitle');
    case 'repairing': return t('apexLaunchRepair.stage.repairingTitle');
    case 'ready':
      return issueCount.value > 0
        ? t('apexLaunchRepair.stage.issuesTitle', {count: issueCount.value})
        : t('apexLaunchRepair.stage.healthyTitle');
    default: return t('apexLaunchRepair.stage.idleTitle');
  }
});
const stageSubtitle = computed(() => {
  if (!target.value) return t('apexLaunchRepair.stage.accountRequiredSubtitle');
  if (phase.value === 'scanning' || phase.value === 'refreshing') {
    return t(`apexLaunchRepair.stage.${phase.value}Subtitle`, {
      current: currentCheckNumber.value,
      total: APEX_LAUNCH_REPAIR_CHECK_IDS.length,
      check: currentCheckId.value ? checkTitle(currentCheckId.value) : '',
    });
  }
  if (phase.value === 'repairing') return t('apexLaunchRepair.stage.repairingSubtitle');
  if (phase.value === 'ready') {
    return t('apexLaunchRepair.summary', {
      count: results.value.length,
      issues: issueCount.value,
      time: lastChecked.value,
    });
  }
  return t('apexLaunchRepair.stage.idleSubtitle');
});
const stageColor = computed(() => {
  if (!target.value) return 'warning';
  if (isBusy.value) return 'primary';
  if (phase.value === 'ready') return issueCount.value > 0 ? 'warning' : 'success';
  return 'primary';
});
const stageIcon = computed(() => {
  if (!target.value) return 'mdi-account-question';
  if (phase.value === 'ready') return issueCount.value > 0
        ? 'mdi-alert-circle'
        : 'mdi-check-circle';
  return phase.value === 'repairing' ? 'mdi-auto-fix' : 'mdi-shield-search';
});
const statusIcons: Record<Exclude<UiStatus, 'checking'>, string> = {
  pending: 'mdi-dots-horizontal-circle-outline',
  pass: 'mdi-check-circle',
  info: 'mdi-information-outline',
  warning: 'mdi-alert-circle',
  error: 'mdi-close-circle',
};

function checkTitle(checkId: string): string {
  return t(`apexLaunchRepair.checks.${checkId}.title`);
}

function checkDescription(checkId: string): string {
  return t(`apexLaunchRepair.checks.${checkId}.description`);
}

function actionLabel(actionId: string): string {
  return t(`apexLaunchRepair.actions.${actionId}.title`);
}

function actionImpact(actionId: string): string {
  return t(`apexLaunchRepair.actions.${actionId}.impact`);
}

function actionResultDetail(result: ApexLaunchRepairActionResult): string {
  if (result.success) return result.changedItems.join('\n');
  if (!result.errorCode) return '';
  const key = `apexLaunchRepair.actionErrors.${result.errorCode}`;
  return te(key) ? t(key) : result.errorCode;
}

function resultFor(checkId: string): ApexLaunchRepairCheckResult | undefined {
  return visibleResults.value.find(result => result.id === checkId);
}

function statusFor(checkId: string): UiStatus {
  if ((phase.value === 'scanning' || phase.value === 'refreshing')
    && currentCheckId.value === checkId) return 'checking';
  return resultFor(checkId)?.status ?? 'pending';
}

function statusColor(status: UiStatus): string {
  if (status === 'pass') return 'success';
  if (status === 'error') return 'error';
  if (status === 'warning') return 'warning';
  if (status === 'info') return 'info';
  return 'medium-emphasis';
}

function checkDetail(checkId: string): string {
  const result = resultFor(checkId);
  if (!result) return checkDescription(checkId);
  const key = `apexLaunchRepair.checks.${checkId}.details.${result.detailCode}`;
  return te(key) ? t(key, result.params) : checkDescription(checkId);
}

function batchActions(result: ApexLaunchRepairCheckResult | undefined) {
  return result?.actions.filter(action => action.mode === 'batch') ?? [];
}

function directActions(result: ApexLaunchRepairCheckResult | undefined) {
  return result?.actions.filter(action => action.mode !== 'batch') ?? [];
}

function isSelected(actionId: string): boolean {
  return selectedActions.value.includes(actionId);
}

function toggleAction(actionId: string, selected: boolean | null) {
  const next = new Set(selectedActions.value);
  if (selected) next.add(actionId);
  else next.delete(actionId);
  selectedActions.value = [...next];
}

function selectRecommended() {
  selectedActions.value = [...recommendedActions.value];
}

function clearReport() {
  operationGeneration += 1;
  phase.value = 'idle';
  results.value = [];
  workingResults.value = [];
  actionResults.value = [];
  selectedActions.value = [];
  checkedAtMs.value = null;
  currentCheckId.value = null;
  completedCheckCount.value = 0;
}

function browserPreviewResults(): ApexLaunchRepairCheckResult[] {
  return [
    {id: 'installation', status: 'pass', detailCode: 'found', params: {launcher: 'Steam', path: 'C:\\Games\\Apex Legends'}, actions: []},
    {id: 'processes', status: 'pass', detailCode: 'available', params: {}, actions: []},
    {id: 'game_files', status: 'pass', detailCode: 'present', params: {}, actions: []},
    {
      id: 'anti_cheat',
      status: 'warning',
      detailCode: 'serviceMissing',
      params: {},
      actions: [{id: 'repair_eac', mode: 'batch', requiresAdmin: true, restartRequired: false, recommended: true}],
    },
    {id: 'crash_logs', status: 'info', detailCode: 'detected', params: {}, actions: []},
    {id: 'configuration', status: 'info', detailCode: 'customLaunchOptions', params: {}, actions: []},
    {
      id: 'apex_cache',
      status: 'warning',
      detailCode: 'available',
      params: {psoBytes: 18432000, assetsBytes: 67108864},
      actions: [
        {id: 'clear_apex_pso_cache', mode: 'batch', requiresAdmin: false, restartRequired: false, recommended: true},
        {id: 'clear_apex_assets_cache', mode: 'batch', requiresAdmin: false, restartRequired: false, recommended: true},
      ],
    },
    {
      id: 'shader_cache',
      status: 'warning',
      detailCode: 'available',
      params: {directxBytes: 125829120, nvidiaBytes: 268435456},
      actions: [
        {id: 'clear_directx_shader_cache', mode: 'batch', requiresAdmin: false, restartRequired: false, recommended: false},
        {id: 'clear_nvidia_shader_cache', mode: 'batch', requiresAdmin: false, restartRequired: false, recommended: false},
      ],
    },
    {id: 'runtime', status: 'pass', detailCode: 'healthy', params: {}, actions: []},
    {
      id: 'conflicts',
      status: 'warning',
      detailCode: 'running',
      params: {processes: 'RTSS.exe'},
      actions: [{id: 'close_conflicting_apps', mode: 'batch', requiresAdmin: false, restartRequired: false, recommended: true}],
    },
  ];
}

async function runBrowserPreviewScan() {
  const generation = ++operationGeneration;
  const previews = browserPreviewResults();
  phase.value = hasReport.value ? 'refreshing' : 'scanning';
  workingResults.value = [];
  currentCheckId.value = null;
  completedCheckCount.value = 0;
  selectedActions.value = [];
  for (const preview of previews) {
    if (generation !== operationGeneration) return;
    currentCheckId.value = preview.id;
    await new Promise(resolve => window.setTimeout(resolve, 160));
    if (generation !== operationGeneration) return;
    workingResults.value = [...workingResults.value, preview];
    completedCheckCount.value = workingResults.value.length;
  }
  results.value = [...workingResults.value];
  checkedAtMs.value = Date.now();
  currentCheckId.value = null;
  phase.value = 'ready';
}

async function initialize(accountKeyToRestore: string | null) {
  const generation = ++initializeGeneration;
  ready.value = false;
  accountLoadError.value = null;
  try {
    await startTauriStoreOnce('apex', () => apexStore.$tauri.start());
    if (generation !== initializeGeneration) return;
    if (accountKeyToRestore) apexStore.launcher_selection_key = accountKeyToRestore;
    await apexStore.refresh_apex_accounts({silent: true});
    if (generation !== initializeGeneration) return;
    ready.value = true;
  } catch (error) {
    if (generation !== initializeGeneration) return;
    accountLoadError.value = formatIpcError(error);
  }
}

function onAccountChanged() {
  if (isBusy.value || resettingConfig.value) return;
  clearReport();
}

async function scan() {
  if (!isTauriRuntime) {
    if (!isBusy.value) await runBrowserPreviewScan();
    return;
  }
  const selectedTarget = target.value;
  const selectedAccountKey = accountKey.value;
  if (!selectedTarget || isBusy.value) return;
  const generation = ++operationGeneration;
  const hadReport = hasReport.value;
  phase.value = apexLaunchRepairLoadPhase(hadReport);
  workingResults.value = [];
  currentCheckId.value = null;
  completedCheckCount.value = 0;
  selectedActions.value = [];

  try {
    for (const checkId of APEX_LAUNCH_REPAIR_CHECK_IDS) {
      if (generation !== operationGeneration || accountKey.value !== selectedAccountKey) return;
      currentCheckId.value = checkId;
      const result = await diagnoseApexLaunchRepairCheck({
        target: selectedTarget,
        checkId,
      });
      if (generation !== operationGeneration || accountKey.value !== selectedAccountKey) return;
      workingResults.value.push(result);
      completedCheckCount.value = workingResults.value.length;
    }
    results.value = [...workingResults.value];
    checkedAtMs.value = Date.now();
    phase.value = 'ready';
  } catch (error) {
    if (generation !== operationGeneration) return;
    if (!hadReport && workingResults.value.length > 0) {
      results.value = [...workingResults.value];
      checkedAtMs.value = Date.now();
      phase.value = 'ready';
    } else {
      phase.value = apexLaunchRepairLoadFailurePhase(hadReport);
    }
    toast.error(t('apexLaunchRepair.scanFailed', {message: formatIpcError(error)}));
  } finally {
    if (generation === operationGeneration) currentCheckId.value = null;
  }
}

async function repairSelected() {
  const selectedTarget = target.value;
  if (!selectedTarget || isBusy.value || selectedActions.value.length === 0) return;
  if (!isTauriRuntime) {
    const actions = [...selectedActions.value];
    phase.value = 'repairing';
    await new Promise(resolve => window.setTimeout(resolve, 500));
    actionResults.value = actions.map(action => ({
      action,
      success: true,
      errorCode: null,
      restartRequired: false,
      changedItems: ['browser-preview'],
    }));
    selectedActions.value = [];
    phase.value = 'ready';
    return;
  }
  const generation = ++operationGeneration;
  phase.value = 'repairing';
  actionResults.value = [];
  try {
    const repairResults = await repairApexLaunchIssues({
      target: selectedTarget,
      actions: [...selectedActions.value],
    });
    if (generation !== operationGeneration) return;
    actionResults.value = repairResults;
    selectedActions.value = [];
    const failed = repairResults.filter(result => !result.success).length;
    if (failed > 0) {
      toast.warning(t('apexLaunchRepair.repairPartialFailed', {count: failed}));
    } else {
      toast.success(t('apexLaunchRepair.repairSuccess', {count: repairResults.length}));
    }
    phase.value = 'ready';
    await scan();
  } catch (error) {
    if (generation !== operationGeneration) return;
    phase.value = 'ready';
    toast.error(t('apexLaunchRepair.repairFailed', {message: formatIpcError(error)}));
  }
}

function showExternalAction(actionId: string) {
  if (actionId === 'reset_apex_config') {
    resetDialog.value = true;
    return;
  }
  if (actionId === 'open_network_repair') {
    void openRepairToolWindow('network').catch(error => {
      toast.error(t('apexLaunchRepair.externalOpenFailed', {message: String(error)}));
    });
    return;
  }
  externalDialogAction.value = actionId as ExternalActionId;
}

async function openExternalDestination() {
  const action = externalDialogAction.value;
  if (!action || !target.value) return;
  try {
    if (action === 'open_game_repair' && target.value.launcher === 'steam') {
      await openUrl('steam://validate/1172470');
    } else if (action === 'open_launcher_cache' && target.value.launcher === 'steam') {
      await openUrl('steam://open/settings/downloads');
    } else {
      const url = action === 'open_runtime_help'
        ? 'https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist'
        : action === 'open_server_status'
          ? 'https://help.ea.com/en/server-status/'
        : action === 'open_launcher_cache'
          ? 'https://help.ea.com/en/articles/technical-issues/clear-cache/'
          : target.value.launcher === 'steam'
            ? 'https://help.steampowered.com/en/faqs/view/0C48-FCBD-DA71-93EB'
            : 'https://help.ea.com/en/articles/apex-legends/error-codes/';
      await openUrl(url);
    }
  } catch (error) {
    toast.error(t('apexLaunchRepair.externalOpenFailed', {message: String(error)}));
  }
}

async function openGpuVendorSupport(vendor: 'amd' | 'intel') {
  try {
    await openUrl(vendor === 'amd'
      ? 'https://www.amd.com/en/support.html'
      : 'https://www.intel.com/content/www/us/en/support/detect.html');
  } catch (error) {
    toast.error(t('apexLaunchRepair.externalOpenFailed', {message: String(error)}));
  }
}

async function resetApexConfig() {
  if (!target.value || resettingConfig.value) return;
  resettingConfig.value = true;
  try {
    const success = await apexStore.reset_apex_to_defaults();
    if (!success) return;
    resetDialog.value = false;
    await emitApexConfigChanged(['launch', 'video', 'gameSettings']);
    await scan();
  } finally {
    resettingConfig.value = false;
  }
}

onMounted(async () => {
  if (!isTauriRuntime) {
    ready.value = true;
    return;
  }
  const currentWindow = getCurrentWindow();
  void currentWindow.setDecorations(false).catch(() => undefined);
  unlistenAccount = await listenApexLaunchRepairAccount(({accountKey: nextAccountKey}) => {
    if (!nextAccountKey
      || nextAccountKey === accountKey.value
      || isBusy.value
      || resettingConfig.value) return;
    clearReport();
    void initialize(nextAccountKey);
  });
  unlistenClose = await currentWindow.onCloseRequested(event => {
    if (isBusy.value || resettingConfig.value) event.preventDefault();
  });
  await initialize(requestedRouteAccount);
});

onBeforeUnmount(() => {
  operationGeneration += 1;
  unlistenAccount?.();
  unlistenAccount = null;
  unlistenClose?.();
  unlistenClose = null;
});
</script>

<template>
  <v-main class="apex-launch-repair-window">
    <AppTopBar
      :title="t('apexLaunchRepair.windowTitle')"
      :close-disabled="isBusy || resettingConfig"
    />

    <div class="apex-launch-repair-window__body">
      <section class="apex-launch-repair-workbench">
        <header class="apex-launch-repair-header">
          <div class="apex-launch-repair-account">
            <div class="apex-launch-repair-account__copy">
              <span>{{ t('apexLaunchRepair.accountLabel') }}</span>
              <strong>{{ activeAccount?.user.name ?? t('apexLaunchRepair.noAccount') }}</strong>
            </div>
            <div
              v-if="ready"
              class="apex-launch-repair-account__selector"
              :inert="isBusy || resettingConfig"
            >
              <ApexLauncherUser @update_user="onAccountChanged" />
            </div>
            <v-progress-circular v-else indeterminate color="primary" :size="24" :width="2" />
          </div>

          <v-alert
            v-if="accountLoadError"
            type="error"
            variant="tonal"
            density="compact"
            class="apex-launch-repair-account-alert"
          >
            {{ accountLoadError }}
            <template #append>
              <v-btn
                class="apex-launch-repair-inline-action"
                variant="text"
                prepend-icon="mdi-refresh"
                @click="initialize(requestedRouteAccount)"
              >
                {{ t('common.retry') }}
              </v-btn>
            </template>
          </v-alert>

          <section class="apex-launch-repair-summary">
            <div class="apex-launch-repair-summary__status-icon">
              <v-progress-circular
                v-if="isBusy"
                indeterminate
                :color="stageColor"
                :size="24"
                :width="2"
              />
              <v-icon v-else :icon="stageIcon" :color="stageColor" size="22" />
            </div>
            <div class="apex-launch-repair-summary__copy">
              <div class="apex-launch-repair-summary__title">
                <h1>{{ stageTitle }}</h1>
                <span class="mx-beta-badge" :title="t('settings.betaFeaturesHint')">
                  {{ t('common.beta') }}
                </span>
              </div>
              <p>{{ stageSubtitle }}</p>
            </div>
            <div
              v-if="selectedNeedsAdmin || selectedNeedsRestart"
              class="apex-launch-repair-summary__badges"
            >
              <v-chip v-if="selectedNeedsAdmin" size="x-small" color="warning" variant="tonal">
                {{ t('apexLaunchRepair.badges.admin') }}
              </v-chip>
              <v-chip v-if="selectedNeedsRestart" size="x-small" color="info" variant="tonal">
                {{ t('apexLaunchRepair.badges.restart') }}
              </v-chip>
            </div>
          </section>

          <v-progress-linear
            v-if="phase === 'scanning' || phase === 'refreshing'"
            class="apex-launch-repair-progress"
            :model-value="scanProgress"
            color="primary"
            height="3"
          />

        </header>

        <main class="apex-launch-repair-checks" aria-live="polite">
          <v-alert
            v-if="actionResults.length"
            :type="failedActionCount ? 'warning' : 'success'"
            variant="tonal"
            density="compact"
            class="apex-launch-repair-result-summary"
          >
            {{ t('apexLaunchRepair.actionSummary', {
              success: successfulActionCount,
              failed: failedActionCount,
            }) }}
            <span v-if="restartRequired"> · {{ t('apexLaunchRepair.restartNotice') }}</span>
            <div class="apex-launch-repair-result-items">
              <span
                v-for="result in actionResults"
                :key="result.action"
                class="apex-launch-repair-result-item"
                :title="actionResultDetail(result)"
              >
                <v-icon
                  :icon="result.success ? 'mdi-check-circle' : 'mdi-alert-circle'"
                  :color="result.success ? 'success' : 'warning'"
                  size="15"
                />
                {{ actionLabel(result.action) }}
                <small v-if="result.restartRequired">
                  {{ t('apexLaunchRepair.badges.restart') }}
                </small>
              </span>
            </div>
          </v-alert>

        <article
          v-for="(checkId, index) in APEX_LAUNCH_REPAIR_CHECK_IDS"
          :key="checkId"
          class="apex-launch-repair-check"
          :class="{'apex-launch-repair-check--active': currentCheckId === checkId}"
        >
          <div class="apex-launch-repair-check__index">{{ index + 1 }}</div>
          <div class="apex-launch-repair-check__content">
            <div class="apex-launch-repair-check__heading">
              <h2>{{ checkTitle(checkId) }}</h2>
              <p>{{ checkDescription(checkId) }}</p>
            </div>
            <div v-if="resultFor(checkId)" class="apex-launch-repair-check__detail">
              {{ checkDetail(checkId) }}
            </div>
          </div>
          <div
            class="apex-launch-repair-check__status"
            :class="`apex-launch-repair-check__status--${statusFor(checkId)}`"
          >
            <v-progress-circular
              v-if="statusFor(checkId) === 'checking'"
              indeterminate
              color="primary"
              :size="14"
              :width="2"
            />
            <v-icon
              v-else
              :icon="statusIcons[statusFor(checkId) as Exclude<UiStatus, 'checking'>]"
              :color="statusColor(statusFor(checkId))"
              size="16"
            />
            <span>{{ t(`apexLaunchRepair.status.${statusFor(checkId)}`) }}</span>
          </div>
          <div
            v-if="batchActions(resultFor(checkId)).length"
            class="apex-launch-repair-check__actions"
          >
            <label
              v-for="action in batchActions(resultFor(checkId))"
              :key="action.id"
              class="apex-launch-repair-action"
            >
              <v-checkbox-btn
                class="apex-launch-repair-action__checkbox"
                :model-value="isSelected(action.id)"
                :disabled="isBusy"
                color="primary"
                density="compact"
                @update:model-value="toggleAction(action.id, $event)"
              />
              <span class="apex-launch-repair-action__copy">
                <strong>{{ actionLabel(action.id) }}</strong>
                <small>{{ actionImpact(action.id) }}</small>
              </span>
              <span class="apex-launch-repair-action__badges">
                <v-chip v-if="action.requiresAdmin" size="x-small" color="warning" variant="tonal">
                  {{ t('apexLaunchRepair.badges.admin') }}
                </v-chip>
                <v-chip v-if="action.restartRequired" size="x-small" color="info" variant="tonal">
                  {{ t('apexLaunchRepair.badges.restart') }}
                </v-chip>
              </span>
            </label>
          </div>

          <div
            v-if="directActions(resultFor(checkId)).length"
            class="apex-launch-repair-check__direct-actions"
          >
            <v-btn
              v-for="action in directActions(resultFor(checkId))"
              :key="action.id"
              class="apex-launch-repair-command"
              variant="tonal"
              :prepend-icon="action.mode === 'external' ? 'mdi-open-in-new' : 'mdi-history'"
              :disabled="isBusy"
              @click="showExternalAction(action.id)"
            >
              {{ actionLabel(action.id) }}
            </v-btn>
          </div>
        </article>
        </main>

        <footer class="apex-launch-repair-footer">
        <div class="apex-launch-repair-footer__hint">
          <v-icon icon="mdi-information-outline" size="17" />
          <span>{{ t('apexLaunchRepair.selectionHint') }}</span>
        </div>
        <div class="apex-launch-repair-footer__actions">
          <v-btn
            v-if="hasReport"
            class="apex-launch-repair-command"
            variant="text"
            prepend-icon="mdi-format-list-bulleted-square"
            :disabled="isBusy || !target"
            @click="selectRecommended"
          >
            {{ t('apexLaunchRepair.selectRecommended') }}
          </v-btn>
          <v-btn
            v-if="hasReport"
            class="apex-launch-repair-command"
            variant="tonal"
            prepend-icon="mdi-refresh"
            :disabled="isBusy || !target"
            @click="scan"
          >
            {{ t('apexLaunchRepair.rescan') }}
          </v-btn>
          <v-btn
            v-if="hasReport && availableBatchActions.length"
            class="apex-launch-repair-command"
            color="primary"
            variant="flat"
            prepend-icon="mdi-auto-fix"
            :disabled="isBusy || selectedActions.length === 0"
            :loading="phase === 'repairing'"
            @click="repairSelected"
          >
            {{ t('apexLaunchRepair.repairSelected', {count: selectedActions.length}) }}
          </v-btn>
          <v-btn
            v-else-if="!hasReport"
            class="apex-launch-repair-command"
            color="primary"
            variant="flat"
            prepend-icon="mdi-shield-search"
            :disabled="isBusy || !target || !ready"
            @click="scan"
          >
            {{ t('apexLaunchRepair.startCheck') }}
          </v-btn>
        </div>
        </footer>
      </section>
    </div>

    <v-dialog v-model="resetDialog" max-width="560" :persistent="resettingConfig">
      <v-card class="apex-launch-repair-dialog">
        <v-card-title>{{ t('apexLaunchRepair.reset.title') }}</v-card-title>
        <v-card-text>
          <p>{{ t('apexLaunchRepair.reset.description') }}</p>
          <v-alert type="warning" variant="tonal" density="compact" class="mt-4">
            {{ t('apexLaunchRepair.reset.scope') }}
          </v-alert>
          <p class="mt-3 text-medium-emphasis">{{ t('apexLaunchRepair.reset.history') }}</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            class="apex-launch-repair-command"
            prepend-icon="mdi-close"
            :disabled="resettingConfig"
            @click="resetDialog = false"
          >
            {{ t('common.cancel') }}
          </v-btn>
          <v-btn
            class="apex-launch-repair-command"
            color="warning"
            variant="flat"
            prepend-icon="mdi-restore-alert"
            :loading="resettingConfig"
            @click="resetApexConfig"
          >
            {{ t('apexLaunchRepair.reset.confirm') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog
      :model-value="externalDialogAction !== null"
      max-width="560"
      @update:model-value="value => { if (!value) externalDialogAction = null; }"
    >
      <v-card v-if="externalDialogAction" class="apex-launch-repair-dialog">
        <v-card-title>{{ actionLabel(externalDialogAction) }}</v-card-title>
        <v-card-text>
          <p>{{ t(`apexLaunchRepair.external.${externalDialogAction}.${target?.launcher ?? 'steam'}`) }}</p>
          <v-alert type="info" variant="tonal" density="compact" class="mt-4">
            {{ t('apexLaunchRepair.external.notLocalSuccess') }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            class="apex-launch-repair-command"
            prepend-icon="mdi-close"
            @click="externalDialogAction = null"
          >
            {{ t('common.close') }}
          </v-btn>
          <template v-if="externalDialogAction === 'open_gpu_vendor_help'">
            <v-btn
              class="apex-launch-repair-command"
              variant="tonal"
              @click="openGpuVendorSupport('amd')"
            >
              AMD
            </v-btn>
            <v-btn
              class="apex-launch-repair-command"
              color="primary"
              variant="flat"
              @click="openGpuVendorSupport('intel')"
            >
              Intel
            </v-btn>
          </template>
          <v-btn
            v-else
            class="apex-launch-repair-command"
            color="primary"
            variant="flat"
            prepend-icon="mdi-open-in-new"
            @click="openExternalDestination"
          >
            {{ t('apexLaunchRepair.external.open') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-main>
</template>

<style scoped>
.apex-launch-repair-window {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.9);
  background: rgb(var(--v-theme-background));
  letter-spacing: 0;
}

.apex-launch-repair-window__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  box-sizing: border-box;
}

.apex-launch-repair-workbench {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--app-layer-raised);
}

.apex-launch-repair-header {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  margin-right: 6px;
}

.apex-launch-repair-account {
  display: flex;
  align-items: center;
  min-height: 48px;
  gap: 10px;
  padding: 6px 14px;
  border-bottom: 1px solid var(--app-border);
}

.apex-launch-repair-account__copy {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
}

.apex-launch-repair-account__copy span {
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 10px;
  line-height: 1.4;
}

.apex-launch-repair-account__copy strong {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apex-launch-repair-account__selector {
  width: min(280px, 44vw);
  flex: 0 1 280px;
}

.apex-launch-repair-account-alert {
  margin: 0 !important;
  border-radius: 0 !important;
  border-bottom: 1px solid var(--app-border);
  font-size: 11px;
  line-height: 1.5;
}

.apex-launch-repair-inline-action.v-btn {
  min-height: var(--app-control-height-compact) !important;
  height: var(--app-control-height-compact) !important;
  padding-inline: 8px !important;
  border-radius: var(--app-radius-sm) !important;
  letter-spacing: 0;
  text-transform: none;
}

.apex-launch-repair-summary {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) 88px;
  align-items: center;
  min-height: 54px;
  gap: 10px;
  padding: 7px 14px;
  border-bottom: 1px solid var(--app-border);
}

.apex-launch-repair-summary__status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
}

.apex-launch-repair-summary__copy {
  flex: 1 1 auto;
  min-width: 0;
}

.apex-launch-repair-summary__title {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.apex-launch-repair-summary h1,
.apex-launch-repair-summary p {
  margin: 0;
}

.apex-launch-repair-summary h1 {
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 12px;
  font-weight: 680;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.apex-launch-repair-summary p {
  margin-top: 1px;
  color: rgba(var(--v-theme-on-surface), 0.46);
  font-size: 10px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.apex-launch-repair-summary__badges {
  display: flex;
  align-items: center;
  justify-self: end;
  justify-content: flex-end;
  flex-wrap: wrap;
  width: max-content;
  max-width: 88px;
  gap: 5px;
}

.apex-launch-repair-progress {
  flex: 0 0 auto;
}

.apex-launch-repair-result-summary {
  margin: 0 !important;
  border-radius: 0 !important;
  border-bottom: 1px solid var(--app-border);
  font-size: 11px;
  line-height: 1.5;
}

.apex-launch-repair-result-items {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
  margin-top: 5px;
}

.apex-launch-repair-result-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  line-height: 1.4;
}

.apex-launch-repair-result-item small {
  color: rgba(var(--v-theme-on-surface), 0.62);
}

.apex-launch-repair-checks {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.apex-launch-repair-check {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 88px;
  min-width: 0;
  gap: 8px;
  padding: 5px 14px;
  border-bottom: 1px solid var(--app-border);
  transition: background-color var(--app-motion-fast) var(--app-ease-standard);
}

.apex-launch-repair-check:last-child {
  border-bottom: 0;
}

.apex-launch-repair-check--active {
  background: rgba(var(--v-theme-primary), 0.045);
}

.apex-launch-repair-check__index {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  color: rgba(var(--v-theme-on-surface), 0.5);
  border: 1px solid var(--app-border);
  border-radius: 4px;
  background: var(--app-layer-muted);
  font-size: 10px;
  font-weight: 650;
}

.apex-launch-repair-check--active .apex-launch-repair-check__index {
  color: rgb(var(--v-theme-primary));
  border-color: rgba(var(--v-theme-primary), 0.28);
  background: rgba(var(--v-theme-primary), 0.08);
}

.apex-launch-repair-check__content {
  flex: 1 1 auto;
  min-width: 0;
}

.apex-launch-repair-check__heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  row-gap: 0;
}

.apex-launch-repair-check h2,
.apex-launch-repair-check p {
  margin: 0;
}

.apex-launch-repair-check h2 {
  min-width: 0;
  color: rgba(var(--v-theme-on-surface), 0.88);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.apex-launch-repair-check p {
  color: rgba(var(--v-theme-on-surface), 0.42);
  font-size: 10px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.apex-launch-repair-check__detail {
  margin-top: 2px;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 10px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.apex-launch-repair-check__status {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: center;
  align-self: start;
  grid-column: 3;
  grid-row: 1;
  justify-self: end;
  width: 88px;
  min-width: 88px;
  gap: 5px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 11px;
  line-height: 1.4;
  margin-top: 7px;
  white-space: nowrap;
}

.apex-launch-repair-check__status > :first-child {
  justify-self: center;
}

.apex-launch-repair-check__status--checking {
  color: rgb(var(--v-theme-primary));
}

.apex-launch-repair-check__status--pass {
  color: rgb(var(--v-theme-success));
}

.apex-launch-repair-check__status--info {
  color: rgb(var(--v-theme-info));
}

.apex-launch-repair-check__status--warning {
  color: rgb(var(--v-theme-warning));
}

.apex-launch-repair-check__status--error {
  color: rgb(var(--v-theme-error));
}

.apex-launch-repair-check__actions {
  display: grid;
  grid-column: 2 / 4;
  margin-top: 6px;
  margin-inline: -8px;
  border-top: 1px solid var(--app-border);
}

.apex-launch-repair-action {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 88px;
  align-items: center;
  min-height: 40px;
  gap: 7px;
  padding: 4px 8px;
  cursor: pointer;
  transition: background-color var(--app-motion-fast) var(--app-ease-standard);
}

.apex-launch-repair-action__checkbox {
  grid-area: auto;
  grid-column: 1;
}

.apex-launch-repair-action + .apex-launch-repair-action {
  border-top: 1px solid var(--app-border);
}

.apex-launch-repair-action__checkbox :deep(.v-selection-control) {
  min-height: var(--app-control-height-compact);
}

.apex-launch-repair-action__checkbox :deep(.v-selection-control__wrapper) {
  width: var(--app-control-height-compact);
  height: var(--app-control-height-compact);
}

.apex-launch-repair-action__copy {
  display: flex;
  grid-column: 2;
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
}

.apex-launch-repair-action__copy strong {
  font-size: 12px;
  font-weight: 650;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.apex-launch-repair-action__copy small {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.apex-launch-repair-action__badges {
  display: flex;
  grid-column: 3;
  align-items: center;
  justify-self: end;
  justify-content: flex-end;
  flex-wrap: wrap;
  width: max-content;
  max-width: 88px;
  gap: 4px;
}

.apex-launch-repair-check__direct-actions {
  display: flex;
  grid-column: 2 / 4;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.apex-launch-repair-command.v-btn {
  min-height: var(--app-control-height-action) !important;
  height: var(--app-control-height-action) !important;
  padding-inline: 11px !important;
  border-radius: var(--app-radius-sm) !important;
  letter-spacing: 0;
  text-transform: none;
}

.apex-launch-repair-footer {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: center;
  flex: 0 0 auto;
  min-height: 56px;
  gap: 12px;
  margin-right: 6px;
  padding: 9px 14px;
  border-top: 1px solid var(--app-border);
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.apex-launch-repair-footer__hint {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 7px;
  color: rgba(var(--v-theme-on-surface), 0.52);
  font-size: 11px;
  line-height: 1.45;
  overflow-x: auto;
  white-space: nowrap;
  scrollbar-width: none;
}

.apex-launch-repair-footer__hint::-webkit-scrollbar {
  display: none;
}

.apex-launch-repair-footer__hint .v-icon {
  flex: 0 0 auto;
}

.apex-launch-repair-footer__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  min-width: 0;
  gap: 6px;
}

.apex-launch-repair-dialog.v-card {
  border-radius: var(--app-radius-md);
}

.apex-launch-repair-dialog :deep(.v-card-title) {
  font-size: 15px;
  font-weight: 680;
  line-height: 1.4;
}

.apex-launch-repair-dialog :deep(.v-card-text) {
  font-size: 12px;
  line-height: 1.55;
}

.apex-launch-repair-dialog :deep(.v-alert) {
  border-radius: var(--app-radius-sm);
}

@media (hover: hover) {
  .apex-launch-repair-check:hover,
  .apex-launch-repair-action:hover {
    background: var(--app-hover);
  }

  .apex-launch-repair-check--active:hover {
    background: rgba(var(--v-theme-primary), 0.065);
  }
}

@media (max-width: 820px) {
  .apex-launch-repair-window__body {
    padding: 0;
  }

  .apex-launch-repair-account,
  .apex-launch-repair-summary,
  .apex-launch-repair-check,
  .apex-launch-repair-footer {
    padding-inline: 12px;
  }

  .apex-launch-repair-footer {
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .apex-launch-repair-footer__actions {
    justify-content: flex-end;
  }
}

@media (max-width: 640px) {
  .apex-launch-repair-window__body {
    padding: 0;
  }

  .apex-launch-repair-account {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .apex-launch-repair-account__selector {
    width: 100%;
    flex-basis: 100%;
  }

  .apex-launch-repair-summary {
    grid-template-columns: 24px minmax(0, 1fr);
  }

  .apex-launch-repair-summary__badges {
    grid-column: 2;
    justify-content: flex-start;
  }

  .apex-launch-repair-action {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .apex-launch-repair-action__badges {
    grid-column: 2;
    justify-self: start;
    justify-content: flex-start;
    width: auto;
    max-width: none;
  }

  .apex-launch-repair-footer__actions {
    align-items: stretch;
    flex-direction: column;
  }

  .apex-launch-repair-footer__actions .v-btn {
    width: 100%;
  }
}
</style>
