<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {writeText} from '@tauri-apps/plugin-clipboard-manager';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {
  getLocalShareDetails,
  listLocalShareAccess,
  listLocalShares,
  openSharedFolder,
  removeLocalShare,
} from '@/ipc/commands.ts';
import {folderSharingErrorKey, normalizeFolderSharingError} from '@/utils/folder_sharing.ts';
import ShareEditorDialog from './ShareEditorDialog.vue';
import type {
  LocalShare,
  ShareAccessEntry,
  ShareApplyResult,
  ShareDetails,
} from '@/types/folder_sharing.ts';

const {t} = useI18n();
const toast = useToast();
const shares = ref<LocalShare[]>([]);
const detailsByName = ref<Record<string, ShareDetails>>({});
const accessByName = ref<Record<string, ShareAccessEntry[]>>({});
const loading = ref(false);
const loadingAccess = ref(false);
const loadingDetailsName = ref('');
const showSystem = ref(false);
const editorOpen = ref(false);
const editorDetails = ref<ShareDetails | null>(null);
const removeOpen = ref(false);
const forceConfirmOpen = ref(false);
const removeTarget = ref<LocalShare | null>(null);
const cleanupNtfs = ref(false);
const force = ref(false);
const forceRequired = ref(false);
const removing = ref(false);
const removeError = ref('');

const visibleShares = computed(() => shares.value.filter(share => showSystem.value || !share.special));
const hiddenSystemCount = computed(() => shares.value.filter(share => share.special).length);

function errorMessage(error: unknown): string {
  const normalized = normalizeFolderSharingError(error);
  return t(folderSharingErrorKey(normalized), {message: normalized.message});
}

async function loadShares() {
  loading.value = true;
  try {
    shares.value = await listLocalShares();
  } catch (error) {
    toast.error(errorMessage(error));
  } finally {
    loading.value = false;
  }
}

async function loadAccessSummaries() {
  if (loadingAccess.value) return;
  loadingAccess.value = true;
  try {
    const summaries = await listLocalShareAccess();
    accessByName.value = Object.fromEntries(
      summaries.map(summary => [summary.name.toLowerCase(), summary.access]),
    );
  } catch (error) {
    const normalized = normalizeFolderSharingError(error);
    if (normalized.code !== 'user_cancelled') toast.error(errorMessage(normalized));
  } finally {
    loadingAccess.value = false;
  }
}

function isEditable(share: LocalShare): boolean {
  return share.diskShare && !share.special;
}

function createShare() {
  editorDetails.value = null;
  editorOpen.value = true;
}

async function editShare(share: LocalShare) {
  if (!isEditable(share)) return;
  loadingDetailsName.value = share.name;
  try {
    const details = await getLocalShareDetails({name: share.name});
    detailsByName.value[share.name.toLowerCase()] = details;
    editorDetails.value = details;
    editorOpen.value = true;
  } catch (error) {
    const normalized = normalizeFolderSharingError(error);
    if (normalized.code !== 'user_cancelled') toast.error(errorMessage(normalized));
  } finally {
    loadingDetailsName.value = '';
  }
}

async function copyAddress(share: LocalShare) {
  try {
    await writeText(share.uncPath);
    toast.success(t('folderSharing.local.addressCopied'));
  } catch (error) {
    toast.error(errorMessage(error));
  }
}

async function openFolder(share: LocalShare) {
  if (!share.path) return;
  try {
    await openSharedFolder({path: share.path});
  } catch (error) {
    toast.error(errorMessage(error));
  }
}

function permissionLabel(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === 'full') return t('folderSharing.permissions.full');
  if (normalized === 'change') return t('folderSharing.permissions.change');
  return t('folderSharing.permissions.read');
}

function permissionSummary(share: LocalShare): string {
  if (share.special) return t('folderSharing.local.systemManaged');
  const key = share.name.toLowerCase();
  const access = detailsByName.value[key]?.access ?? accessByName.value[key];
  if (!access) return t('folderSharing.local.permissionNotLoaded');
  const entries = access.filter(entry => entry.accessControlType.toLowerCase() === 'allow');
  if (!entries.length) return t('folderSharing.local.noAllowEntries');
  const first = entries.slice(0, 2).map(entry => `${entry.accountName}: ${permissionLabel(entry.accessRight)}`);
  if (entries.length > 2) first.push(t('folderSharing.local.morePermissions', {count: entries.length - 2}));
  return first.join(' · ');
}

function askRemove(share: LocalShare) {
  removeTarget.value = share;
  cleanupNtfs.value = false;
  force.value = false;
  forceRequired.value = share.currentUsers > 0;
  removeError.value = '';
  removeOpen.value = true;
}

function requestRemove() {
  if (force.value) {
    forceConfirmOpen.value = true;
    return;
  }
  void performRemove();
}

async function performRemove() {
  if (!removeTarget.value || removing.value) return;
  forceConfirmOpen.value = false;
  removing.value = true;
  removeError.value = '';
  try {
    const result = await removeLocalShare({
      name: removeTarget.value.name,
      force: force.value,
      cleanupNtfs: cleanupNtfs.value,
    });
    if (result.aclCleanupSkipped) {
      toast.warning(t('folderSharing.local.aclCleanupSkipped'));
    } else {
      toast.success(t('folderSharing.local.removed'));
    }
    removeOpen.value = false;
    delete detailsByName.value[result.name.toLowerCase()];
    await loadShares();
  } catch (error) {
    const normalized = normalizeFolderSharingError(error);
    if (normalized.code === 'share_in_use') forceRequired.value = true;
    if (normalized.code !== 'user_cancelled') removeError.value = errorMessage(normalized);
  } finally {
    removing.value = false;
  }
}

function handleSaved(result: ShareApplyResult) {
  const key = result.share.name.toLowerCase();
  detailsByName.value[key] = result;
  accessByName.value[key] = result.access;
  void loadShares();
}

onMounted(() => {
  void loadShares();
});
</script>

<template>
  <section class="sharing-panel">
    <header class="panel-toolbar">
      <div>
        <h2>{{ t('folderSharing.local.title') }}</h2>
        <p>{{ t('folderSharing.local.subtitle') }}</p>
      </div>
      <div class="toolbar-actions">
        <v-switch
          v-if="hiddenSystemCount"
          v-model="showSystem"
          color="primary"
          density="compact"
          hide-details
          :label="t('folderSharing.local.showSystem', {count: hiddenSystemCount})"
        />
        <v-btn
          size="small"
          variant="tonal"
          prepend-icon="mdi-shield-search"
          :loading="loadingAccess"
          :disabled="loading || !shares.some(share => isEditable(share))"
          @click="loadAccessSummaries"
        >
          {{ t('folderSharing.local.loadPermissions') }}
        </v-btn>
        <v-tooltip :text="t('folderSharing.refresh')">
          <template #activator="{props}">
            <v-btn v-bind="props" icon="mdi-refresh" variant="text" :loading="loading" @click="loadShares" />
          </template>
        </v-tooltip>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-plus" @click="createShare">
          {{ t('folderSharing.local.create') }}
        </v-btn>
      </div>
    </header>

    <v-progress-linear v-if="loading && shares.length" indeterminate color="primary" />
    <v-skeleton-loader v-if="loading && !shares.length" type="table-heading, table-row@5" />

    <div v-else-if="visibleShares.length" class="share-table" role="table">
      <div class="share-row share-header" role="row">
        <span>{{ t('folderSharing.local.columns.name') }}</span>
        <span>{{ t('folderSharing.local.columns.path') }}</span>
        <span>{{ t('folderSharing.local.columns.permission') }}</span>
        <span>{{ t('folderSharing.local.columns.connections') }}</span>
        <span class="actions-column">{{ t('folderSharing.local.columns.actions') }}</span>
      </div>
      <div v-for="share in visibleShares" :key="share.name" class="share-row" role="row">
        <div class="share-name">
          <v-icon :icon="share.special ? 'mdi-lock' : 'mdi-folder-outline'" size="19" />
          <div>
            <b>{{ share.name }}</b>
            <small class="selectable-text">{{ share.uncPath }}</small>
          </div>
        </div>
        <span class="path-cell selectable-text" :title="share.path">{{ share.path || '-' }}</span>
        <span class="permission-cell" :title="permissionSummary(share)">{{ permissionSummary(share) }}</span>
        <v-chip size="small" :color="share.currentUsers ? 'warning' : undefined" variant="tonal">
          {{ share.currentUsers }}
        </v-chip>
        <div class="row-actions">
          <v-tooltip :text="t('folderSharing.local.copyAddress')">
            <template #activator="{props}">
              <v-btn v-bind="props" icon="mdi-content-copy" size="small" variant="text" @click="copyAddress(share)" />
            </template>
          </v-tooltip>
          <v-tooltip :text="t('folderSharing.local.openFolder')">
            <template #activator="{props}">
              <v-btn v-bind="props" icon="mdi-folder-open-outline" size="small" variant="text" :disabled="!share.path" @click="openFolder(share)" />
            </template>
          </v-tooltip>
          <v-tooltip v-if="isEditable(share)" :text="t('folderSharing.local.edit')">
            <template #activator="{props}">
              <v-btn
                v-bind="props"
                icon="mdi-pencil"
                size="small"
                variant="text"
                :loading="loadingDetailsName === share.name"
                @click="editShare(share)"
              />
            </template>
          </v-tooltip>
          <v-tooltip v-if="isEditable(share)" :text="t('folderSharing.local.stop')">
            <template #activator="{props}">
              <v-btn v-bind="props" icon="mdi-delete-outline" size="small" color="error" variant="text" @click="askRemove(share)" />
            </template>
          </v-tooltip>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <v-icon icon="mdi-folder-outline" size="34" />
      <b>{{ t('folderSharing.local.empty') }}</b>
      <span>{{ t('folderSharing.local.emptyHint') }}</span>
    </div>

    <ShareEditorDialog v-model="editorOpen" :details="editorDetails" @saved="handleSaved" />

    <v-dialog v-model="removeOpen" max-width="520" persistent>
      <v-card class="confirm-card">
        <v-card-title>{{ t('folderSharing.local.removeTitle', {name: removeTarget?.name ?? ''}) }}</v-card-title>
        <v-card-text>
          <v-alert type="warning" variant="tonal" density="compact" class="mb-4">
            {{ t('folderSharing.local.removeSafety', {path: removeTarget?.path ?? ''}) }}
          </v-alert>
          <v-alert v-if="removeError" type="error" variant="tonal" density="compact" class="mb-3">
            {{ removeError }}
          </v-alert>
          <v-checkbox
            v-model="cleanupNtfs"
            color="warning"
            hide-details
            :label="t('folderSharing.local.cleanupNtfs')"
          />
          <p class="option-help">{{ t('folderSharing.local.cleanupNtfsHint') }}</p>
          <template v-if="forceRequired">
            <v-checkbox v-model="force" color="error" hide-details :label="t('folderSharing.local.forceStop')" />
            <p class="option-help option-help--danger">{{ t('folderSharing.local.forceStopHint') }}</p>
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="removing" @click="removeOpen = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="error" variant="flat" :loading="removing" :disabled="forceRequired && !force" @click="requestRemove">
            {{ t('folderSharing.local.stop') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="forceConfirmOpen" max-width="440">
      <v-card class="confirm-card">
        <v-card-title>{{ t('folderSharing.local.forceConfirmTitle') }}</v-card-title>
        <v-card-text>{{ t('folderSharing.local.forceConfirmBody') }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="forceConfirmOpen = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="error" variant="flat" :loading="removing" @click="performRemove">
            {{ t('folderSharing.local.forceConfirmAction') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.sharing-panel { border: 1px solid rgba(var(--v-border-color), 0.14); border-radius: 8px; overflow: hidden; background: rgba(var(--v-theme-surface), 0.42); }
.panel-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 70px; padding: 12px 14px; border-bottom: 1px solid rgba(var(--v-border-color), 0.13); }
.panel-toolbar h2 { margin: 0; font-size: 0.92rem; letter-spacing: 0; }
.panel-toolbar p { margin: 3px 0 0; color: rgba(var(--v-theme-on-surface), 0.55); font-size: 0.7rem; }
.toolbar-actions { display: flex; align-items: center; flex: 0 0 auto; gap: 6px; }
.toolbar-actions :deep(.v-switch .v-label) { font-size: 0.7rem; }
.share-table { width: 100%; }
.share-row { display: grid; grid-template-columns: minmax(140px, 1.1fr) minmax(130px, 1.2fr) minmax(150px, 1.4fr) 70px 170px; align-items: center; min-height: 58px; gap: 10px; padding: 7px 12px; border-top: 1px solid rgba(var(--v-border-color), 0.09); font-size: 0.74rem; }
.share-header { min-height: 34px; border-top: 0; background: rgba(var(--v-theme-on-surface), 0.035); color: rgba(var(--v-theme-on-surface), 0.53); font-size: 0.66rem; font-weight: 650; }
.actions-column { text-align: end; }
.share-name { display: flex; align-items: center; min-width: 0; gap: 9px; }
.share-name > div { display: flex; flex-direction: column; min-width: 0; }
.share-name b { font-size: 0.78rem; }
.share-name small, .path-cell, .permission-cell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.share-name small { color: rgba(var(--v-theme-on-surface), 0.48); font-size: 0.64rem; }
.path-cell, .permission-cell { color: rgba(var(--v-theme-on-surface), 0.65); }
.selectable-text { user-select: text; }
.row-actions { display: flex; align-items: center; justify-content: flex-end; min-width: 168px; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 260px; gap: 6px; color: rgba(var(--v-theme-on-surface), 0.5); font-size: 0.72rem; text-align: center; }
.empty-state b { color: rgba(var(--v-theme-on-surface), 0.75); font-size: 0.84rem; }
.confirm-card { border-radius: 8px; }
.option-help { margin: 0 0 5px 40px; color: rgba(var(--v-theme-on-surface), 0.53); font-size: 0.68rem; line-height: 1.45; }
.option-help--danger { color: rgb(var(--v-theme-error)); }
@media (max-width: 960px) {
  .share-row { grid-template-columns: minmax(130px, 1fr) minmax(130px, 1fr) 62px 170px; }
  .share-header > :nth-child(3), .permission-cell { display: none; }
}
@media (max-width: 680px) {
  .panel-toolbar { align-items: flex-start; flex-direction: column; }
  .toolbar-actions { width: 100%; flex-wrap: wrap; }
  .share-header { display: none; }
  .share-row { grid-template-columns: minmax(0, 1fr) auto; gap: 7px; padding-block: 10px; }
  .path-cell { grid-column: 1 / -1; grid-row: 2; }
  .share-row > .v-chip { grid-column: 2; grid-row: 1; }
  .row-actions { grid-column: 1 / -1; grid-row: 3; justify-content: flex-start; min-width: 0; }
}
</style>
