<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {repairFolderSharing, scanFolderSharingHealth} from '@/ipc/commands.ts';
import {folderSharingErrorKey, normalizeFolderSharingError} from '@/utils/folder_sharing.ts';
import type {
  HealthStatus,
  NetworkProfile,
  RepairResult,
  ShareHealthCheck,
  ShareHealthReport,
} from '@/types/folder_sharing.ts';

const {t, te} = useI18n();
const toast = useToast();
const report = ref<ShareHealthReport | null>(null);
const loading = ref(false);
const errorText = ref('');
const selectedActions = ref<string[]>([]);
const previewOpen = ref(false);
const repairing = ref(false);
const publicProfileOpen = ref(false);
const publicProfileTarget = ref<NetworkProfile | null>(null);
const lastResults = ref<RepairResult[]>([]);

const summary = computed(() => {
  const checks = report.value?.checks ?? [];
  return {
    pass: checks.filter(check => check.status === 'pass').length,
    warning: checks.filter(check => check.status === 'warning' || check.status === 'error').length,
    unknown: checks.filter(check => check.status === 'unknown').length,
  };
});

const statusIcons: Record<HealthStatus, string> = {
  pass: 'mdi-check-circle',
  warning: 'mdi-alert-circle',
  error: 'mdi-close-circle',
  unknown: 'mdi-help-circle-outline',
};
const statusColors: Record<HealthStatus, string> = {
  pass: 'success',
  warning: 'warning',
  error: 'error',
  unknown: 'grey',
};

function errorMessage(error: unknown): string {
  const normalized = normalizeFolderSharingError(error);
  return t(folderSharingErrorKey(normalized), {message: normalized.message});
}

function checkTitle(check: ShareHealthCheck): string {
  const key = `folderSharing.diagnostics.checks.${check.id}`;
  return te(key) ? t(key) : check.id;
}

function actionTitle(action: string): string {
  if (action.startsWith('set_profile_private:')) return t('folderSharing.diagnostics.actions.set_profile_private');
  const key = `folderSharing.diagnostics.actions.${action}`;
  return te(key) ? t(key) : action;
}

function displayValue(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/ /g, '_');
  const key = `folderSharing.diagnostics.values.${normalized}`;
  return te(key) ? t(key) : value;
}

async function scan() {
  loading.value = true;
  errorText.value = '';
  try {
    report.value = await scanFolderSharingHealth();
    const validActions = new Set(
      report.value.checks
        .filter(check => check.repairAction && (check.status === 'warning' || check.status === 'error'))
        .map(check => check.repairAction as string),
    );
    selectedActions.value = [...validActions];
  } catch (error) {
    errorText.value = errorMessage(error);
  } finally {
    loading.value = false;
  }
}

async function applyRepair(actions: string[], confirmPublicProfileChange: boolean) {
  if (!actions.length || repairing.value) return;
  repairing.value = true;
  try {
    lastResults.value = await repairFolderSharing({actions, confirmPublicProfileChange});
    for (const result of lastResults.value) {
      if (result.success) {
        toast.success(t('folderSharing.diagnostics.repairSuccess', {name: actionTitle(result.action)}));
      } else {
        toast.error(t('folderSharing.diagnostics.repairFailed', {
          name: actionTitle(result.action),
          message: result.message,
        }));
      }
    }
    previewOpen.value = false;
    publicProfileOpen.value = false;
    await scan();
  } catch (error) {
    const normalized = normalizeFolderSharingError(error);
    if (normalized.code !== 'user_cancelled') toast.error(errorMessage(normalized));
  } finally {
    repairing.value = false;
  }
}

function showPublicProfileConfirm(profile: NetworkProfile) {
  publicProfileTarget.value = profile;
  publicProfileOpen.value = true;
}

function repairPublicProfile() {
  if (!publicProfileTarget.value) return;
  void applyRepair([`set_profile_private:${publicProfileTarget.value.interfaceIndex}`], true);
}

onMounted(() => {
  void scan();
});
</script>

<template>
  <div class="diagnostics-layout">
    <section class="diagnostic-summary">
      <div>
        <span>{{ t('folderSharing.diagnostics.computer') }}</span>
        <b>{{ report?.computerName || '-' }}</b>
      </div>
      <div>
        <span>{{ t('folderSharing.diagnostics.addresses') }}</span>
        <b class="selectable-text">{{ report?.addresses.join(', ') || '-' }}</b>
      </div>
      <div class="status-stat pass"><b>{{ summary.pass }}</b><span>{{ t('folderSharing.diagnostics.passed') }}</span></div>
      <div class="status-stat warning"><b>{{ summary.warning }}</b><span>{{ t('folderSharing.diagnostics.attention') }}</span></div>
      <div class="status-stat unknown"><b>{{ summary.unknown }}</b><span>{{ t('folderSharing.diagnostics.unknown') }}</span></div>
      <v-tooltip :text="t('folderSharing.refresh')">
        <template #activator="{props}">
          <v-btn v-bind="props" icon="mdi-refresh" variant="text" :loading="loading" @click="scan" />
        </template>
      </v-tooltip>
    </section>

    <v-alert v-if="errorText" type="error" variant="tonal" density="compact">
      <div class="error-row"><span>{{ errorText }}</span><v-btn size="small" variant="text" @click="scan">{{ t('folderSharing.retry') }}</v-btn></div>
    </v-alert>

    <section v-if="report?.profiles.length" class="sharing-panel">
      <header class="panel-toolbar">
        <div>
          <h2>{{ t('folderSharing.diagnostics.profilesTitle') }}</h2>
          <p>{{ t('folderSharing.diagnostics.profilesSubtitle') }}</p>
        </div>
      </header>
      <div v-for="profile in report.profiles" :key="profile.interfaceIndex" class="profile-row">
        <v-icon icon="mdi-lan-connect" size="20" />
        <div>
          <b>{{ profile.name }}</b>
          <span>{{ profile.ipv4Connectivity }}</span>
        </div>
        <v-chip
          size="small"
          :color="profile.category.toLowerCase() === 'public' ? 'warning' : 'success'"
          variant="tonal"
        >
          {{ t(`folderSharing.diagnostics.profile.${profile.category.toLowerCase()}`, profile.category) }}
        </v-chip>
        <v-btn
          v-if="profile.category.toLowerCase() === 'public'"
          size="small"
          color="warning"
          variant="tonal"
          @click="showPublicProfileConfirm(profile)"
        >
          {{ t('folderSharing.diagnostics.makePrivate') }}
        </v-btn>
      </div>
    </section>

    <section class="sharing-panel">
      <header class="panel-toolbar">
        <div>
          <h2>{{ t('folderSharing.diagnostics.checksTitle') }}</h2>
          <p>{{ t('folderSharing.diagnostics.checksSubtitle') }}</p>
        </div>
        <v-btn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-auto-fix"
          :disabled="selectedActions.length === 0 || loading"
          @click="previewOpen = true"
        >
          {{ t('folderSharing.diagnostics.repairSelected', {count: selectedActions.length}) }}
        </v-btn>
      </header>
      <v-skeleton-loader v-if="loading && !report" type="list-item-two-line@8" />
      <div v-for="check in report?.checks" :key="check.id" class="check-row">
        <v-checkbox
          v-if="check.repairAction && (check.status === 'warning' || check.status === 'error')"
          v-model="selectedActions"
          :value="check.repairAction"
          density="compact"
          hide-details
          :aria-label="checkTitle(check)"
        />
        <span v-else class="checkbox-placeholder"></span>
        <v-icon :icon="statusIcons[check.status]" :color="statusColors[check.status]" size="20" />
        <div>
          <b>{{ checkTitle(check) }}</b>
          <span>{{ displayValue(check.value) }}</span>
        </div>
        <v-chip size="small" :color="statusColors[check.status]" variant="tonal">
          {{ t(`folderSharing.diagnostics.status.${check.status}`) }}
        </v-chip>
      </div>
    </section>

    <v-alert type="info" variant="tonal" density="compact">
      {{ t('folderSharing.diagnostics.safetyNotice') }}
    </v-alert>

    <v-dialog v-model="previewOpen" max-width="560" persistent>
      <v-card class="dialog-card">
        <v-card-title>{{ t('folderSharing.diagnostics.previewTitle') }}</v-card-title>
        <v-card-text>
          <p class="preview-intro">{{ t('folderSharing.diagnostics.previewIntro') }}</p>
          <div class="repair-list">
            <div v-for="action in selectedActions" :key="action">
              <v-icon icon="mdi-check" color="primary" size="18" />
              <span>{{ actionTitle(action) }}</span>
            </div>
          </div>
          <v-alert type="info" variant="tonal" density="compact" class="mt-4">
            {{ t('folderSharing.diagnostics.privateOnlyNotice') }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="repairing" @click="previewOpen = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" :loading="repairing" @click="applyRepair(selectedActions, false)">
            {{ t('folderSharing.diagnostics.applyRepair') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="publicProfileOpen" max-width="520" persistent>
      <v-card class="dialog-card">
        <v-card-title>{{ t('folderSharing.diagnostics.publicConfirmTitle') }}</v-card-title>
        <v-card-text>
          <v-alert type="warning" variant="tonal" density="compact">
            {{ t('folderSharing.diagnostics.publicConfirmBody', {name: publicProfileTarget?.name ?? ''}) }}
          </v-alert>
          <p class="public-warning">{{ t('folderSharing.diagnostics.publicConfirmRisk') }}</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="repairing" @click="publicProfileOpen = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="warning" variant="flat" :loading="repairing" @click="repairPublicProfile">
            {{ t('folderSharing.diagnostics.confirmPrivate') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.diagnostics-layout { display: flex; flex-direction: column; gap: 12px; }
.diagnostic-summary { display: grid; grid-template-columns: minmax(110px, 0.8fr) minmax(180px, 1.4fr) repeat(3, 72px) 40px; align-items: center; gap: 12px; min-height: 78px; padding: 10px 14px; border: 1px solid rgba(var(--v-border-color), 0.14); border-radius: 8px; background: rgba(var(--v-theme-surface), 0.42); }
.diagnostic-summary > div { display: flex; flex-direction: column; min-width: 0; }
.diagnostic-summary span { overflow: hidden; color: rgba(var(--v-theme-on-surface), 0.5); font-size: 0.65rem; text-overflow: ellipsis; white-space: nowrap; }
.diagnostic-summary b { overflow: hidden; font-size: 0.78rem; text-overflow: ellipsis; white-space: nowrap; }
.status-stat { align-items: center; text-align: center; }
.status-stat b { font-size: 1rem; }
.status-stat.pass b { color: rgb(var(--v-theme-success)); }
.status-stat.warning b { color: rgb(var(--v-theme-warning)); }
.status-stat.unknown b { color: rgba(var(--v-theme-on-surface), 0.48); }
.sharing-panel { border: 1px solid rgba(var(--v-border-color), 0.14); border-radius: 8px; overflow: hidden; background: rgba(var(--v-theme-surface), 0.42); }
.panel-toolbar { display: flex; align-items: center; justify-content: space-between; min-height: 64px; gap: 12px; padding: 10px 14px; border-bottom: 1px solid rgba(var(--v-border-color), 0.13); }
.panel-toolbar h2 { margin: 0; font-size: 0.88rem; letter-spacing: 0; }
.panel-toolbar p { margin: 3px 0 0; color: rgba(var(--v-theme-on-surface), 0.52); font-size: 0.68rem; }
.profile-row { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto auto; align-items: center; gap: 10px; min-height: 52px; padding: 7px 12px; border-top: 1px solid rgba(var(--v-border-color), 0.09); }
.profile-row > div { display: flex; flex-direction: column; min-width: 0; }
.profile-row b { font-size: 0.75rem; }
.profile-row span { color: rgba(var(--v-theme-on-surface), 0.5); font-size: 0.65rem; }
.check-row { display: grid; grid-template-columns: 34px 24px minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 52px; padding: 7px 12px; border-top: 1px solid rgba(var(--v-border-color), 0.09); }
.check-row > div { display: flex; flex-direction: column; min-width: 0; }
.check-row b { font-size: 0.75rem; }
.check-row span { overflow: hidden; color: rgba(var(--v-theme-on-surface), 0.52); font-size: 0.65rem; text-overflow: ellipsis; white-space: nowrap; }
.checkbox-placeholder { width: 34px; }
.selectable-text { user-select: text; }
.error-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.dialog-card { border-radius: 8px; }
.preview-intro, .public-warning { margin: 0 0 12px; color: rgba(var(--v-theme-on-surface), 0.62); font-size: 0.74rem; line-height: 1.55; }
.repair-list { border: 1px solid rgba(var(--v-border-color), 0.13); border-radius: 6px; overflow: hidden; }
.repair-list > div { display: flex; align-items: center; min-height: 42px; gap: 9px; padding: 7px 10px; border-top: 1px solid rgba(var(--v-border-color), 0.09); font-size: 0.74rem; }
.repair-list > div:first-child { border-top: 0; }
.public-warning { margin: 12px 2px 0; }
@media (max-width: 800px) {
  .diagnostic-summary { grid-template-columns: repeat(3, 1fr) 40px; }
  .diagnostic-summary > div:nth-child(1), .diagnostic-summary > div:nth-child(2) { grid-column: span 2; }
}
@media (max-width: 560px) {
  .diagnostic-summary { grid-template-columns: repeat(3, minmax(0, 1fr)) 40px; }
  .diagnostic-summary > div:nth-child(1), .diagnostic-summary > div:nth-child(2) { grid-column: 1 / 4; }
  .diagnostic-summary > .v-btn { grid-column: 4; grid-row: 1 / 3; place-self: center; }
  .panel-toolbar { align-items: flex-start; flex-direction: column; }
  .profile-row { grid-template-columns: 24px minmax(0, 1fr) auto; }
  .profile-row > .v-btn { grid-column: 2 / -1; justify-self: end; }
}
</style>
