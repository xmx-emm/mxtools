<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {closeSmbOpenFile, closeSmbSession, getSmbActivity} from '@/ipc/commands.ts';
import {folderSharingErrorKey, normalizeFolderSharingError} from '@/utils/folder_sharing.ts';
import type {SmbActivity, SmbOpenFile, SmbSession} from '@/types/folder_sharing.ts';

type CloseTarget =
  | {kind: 'session'; item: SmbSession}
  | {kind: 'file'; item: SmbOpenFile};

const {t} = useI18n();
const toast = useToast();
const activity = ref<SmbActivity>({sessions: [], openFiles: []});
const loading = ref(false);
const loaded = ref(false);
const errorText = ref('');
const closeOpen = ref(false);
const closeTarget = ref<CloseTarget | null>(null);
const closing = ref(false);

const sessionCount = computed(() => activity.value.sessions.length);
const fileCount = computed(() => activity.value.openFiles.length);

function errorMessage(error: unknown): string {
  const normalized = normalizeFolderSharingError(error);
  return t(folderSharingErrorKey(normalized), {message: normalized.message});
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '-';
  if (seconds < 60) return t('folderSharing.activity.seconds', {count: Math.floor(seconds)});
  if (seconds < 3600) return t('folderSharing.activity.minutes', {count: Math.floor(seconds / 60)});
  if (seconds < 86400) return t('folderSharing.activity.hours', {count: Math.floor(seconds / 3600)});
  return t('folderSharing.activity.days', {count: Math.floor(seconds / 86400)});
}

async function loadActivity() {
  loading.value = true;
  errorText.value = '';
  try {
    activity.value = await getSmbActivity();
    loaded.value = true;
  } catch (error) {
    const normalized = normalizeFolderSharingError(error);
    if (normalized.code !== 'user_cancelled') errorText.value = errorMessage(normalized);
  } finally {
    loading.value = false;
  }
}

function askCloseSession(item: SmbSession) {
  closeTarget.value = {kind: 'session', item};
  closeOpen.value = true;
}

function askCloseFile(item: SmbOpenFile) {
  closeTarget.value = {kind: 'file', item};
  closeOpen.value = true;
}

async function closeTargetItem() {
  if (!closeTarget.value || closing.value) return;
  closing.value = true;
  try {
    if (closeTarget.value.kind === 'session') {
      const id = closeTarget.value.item.sessionId;
      await closeSmbSession({sessionId: id});
      activity.value.sessions = activity.value.sessions.filter(item => item.sessionId !== id);
      activity.value.openFiles = activity.value.openFiles.filter(item => item.sessionId !== id);
      toast.success(t('folderSharing.activity.sessionClosed'));
    } else {
      const id = closeTarget.value.item.fileId;
      await closeSmbOpenFile({fileId: id});
      activity.value.openFiles = activity.value.openFiles.filter(item => item.fileId !== id);
      toast.success(t('folderSharing.activity.fileClosed'));
    }
    closeOpen.value = false;
  } catch (error) {
    const normalized = normalizeFolderSharingError(error);
    if (normalized.code !== 'user_cancelled') toast.error(errorMessage(normalized));
  } finally {
    closing.value = false;
  }
}

onMounted(() => {
  void loadActivity();
});
</script>

<template>
  <div class="activity-layout">
    <v-alert type="warning" variant="tonal" density="compact">
      {{ t('folderSharing.activity.riskNotice') }}
    </v-alert>

    <v-alert v-if="errorText" type="error" variant="tonal" density="compact">
      <div class="error-row">
        <span>{{ errorText }}</span>
        <v-btn size="small" variant="text" @click="loadActivity">{{ t('folderSharing.retry') }}</v-btn>
      </div>
    </v-alert>

    <section class="sharing-panel">
      <header class="panel-toolbar">
        <div>
          <h2>{{ t('folderSharing.activity.sessionsTitle') }}</h2>
          <p>{{ t('folderSharing.activity.sessionsSubtitle', {count: sessionCount}) }}</p>
        </div>
        <v-tooltip :text="t('folderSharing.refresh')">
          <template #activator="{props}">
            <v-btn v-bind="props" icon="mdi-refresh" variant="text" :loading="loading" @click="loadActivity" />
          </template>
        </v-tooltip>
      </header>
      <v-skeleton-loader v-if="loading && !loaded" type="table-heading, table-row@3" />
      <div v-else-if="activity.sessions.length" class="activity-table session-table">
        <div class="activity-row table-header">
          <span>{{ t('folderSharing.activity.client') }}</span>
          <span>{{ t('folderSharing.activity.user') }}</span>
          <span>{{ t('folderSharing.activity.protocol') }}</span>
          <span>{{ t('folderSharing.activity.openCount') }}</span>
          <span>{{ t('folderSharing.activity.idle') }}</span>
          <span></span>
        </div>
        <div v-for="session in activity.sessions" :key="session.sessionId" class="activity-row">
          <div>
            <b>{{ session.clientComputerName || '-' }}</b>
            <small class="selectable-text">ID {{ session.sessionId }}</small>
          </div>
          <span>{{ session.clientUserName || '-' }}</span>
          <div class="protocol-cell">
            <span>SMB {{ session.dialect || '-' }}</span>
            <small>{{ session.signed ? t('folderSharing.activity.signed') : t('folderSharing.activity.unsigned') }} · {{ session.encrypted ? t('folderSharing.activity.encrypted') : t('folderSharing.activity.unencrypted') }}</small>
          </div>
          <v-chip size="small" :color="session.numOpens ? 'warning' : undefined" variant="tonal">{{ session.numOpens }}</v-chip>
          <span>{{ formatDuration(session.secondsIdle) }}</span>
          <v-tooltip :text="t('folderSharing.activity.closeSession')">
            <template #activator="{props}">
              <v-btn v-bind="props" icon="mdi-close" size="small" color="error" variant="text" @click="askCloseSession(session)" />
            </template>
          </v-tooltip>
        </div>
      </div>
      <div v-else class="compact-empty">{{ t('folderSharing.activity.noSessions') }}</div>
    </section>

    <section class="sharing-panel">
      <header class="panel-toolbar">
        <div>
          <h2>{{ t('folderSharing.activity.filesTitle') }}</h2>
          <p>{{ t('folderSharing.activity.filesSubtitle', {count: fileCount}) }}</p>
        </div>
      </header>
      <v-skeleton-loader v-if="loading && !loaded" type="table-heading, table-row@3" />
      <div v-else-if="activity.openFiles.length" class="activity-table file-table">
        <div class="activity-row table-header">
          <span>{{ t('folderSharing.activity.file') }}</span>
          <span>{{ t('folderSharing.activity.client') }}</span>
          <span>{{ t('folderSharing.activity.user') }}</span>
          <span>{{ t('folderSharing.activity.permissions') }}</span>
          <span>{{ t('folderSharing.activity.locks') }}</span>
          <span></span>
        </div>
        <div v-for="file in activity.openFiles" :key="file.fileId" class="activity-row">
          <div class="file-cell">
            <b class="selectable-text" :title="file.path">{{ file.shareRelativePath || file.path }}</b>
            <small class="selectable-text">ID {{ file.fileId }}</small>
          </div>
          <span>{{ file.clientComputerName || '-' }}</span>
          <span>{{ file.clientUserName || '-' }}</span>
          <span>{{ file.permissions || '-' }}</span>
          <v-chip size="small" :color="file.locks ? 'warning' : undefined" variant="tonal">{{ file.locks }}</v-chip>
          <v-tooltip :text="t('folderSharing.activity.closeFile')">
            <template #activator="{props}">
              <v-btn v-bind="props" icon="mdi-close" size="small" color="error" variant="text" @click="askCloseFile(file)" />
            </template>
          </v-tooltip>
        </div>
      </div>
      <div v-else class="compact-empty">{{ t('folderSharing.activity.noFiles') }}</div>
    </section>

    <v-dialog v-model="closeOpen" max-width="470" persistent>
      <v-card class="dialog-card">
        <v-card-title>
          {{ t(closeTarget?.kind === 'session' ? 'folderSharing.activity.closeSessionTitle' : 'folderSharing.activity.closeFileTitle') }}
        </v-card-title>
        <v-card-text>
          <v-alert type="warning" variant="tonal" density="compact">
            {{ t(closeTarget?.kind === 'session' ? 'folderSharing.activity.closeSessionRisk' : 'folderSharing.activity.closeFileRisk') }}
          </v-alert>
          <div v-if="closeTarget" class="target-detail selectable-text">
            {{ closeTarget.kind === 'session' ? closeTarget.item.clientComputerName : closeTarget.item.path }}
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="closing" @click="closeOpen = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="error" variant="flat" :loading="closing" @click="closeTargetItem">
            {{ t('folderSharing.activity.confirmClose') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.activity-layout { display: flex; flex-direction: column; gap: 12px; }
.sharing-panel { border: 1px solid rgba(var(--v-border-color), 0.14); border-radius: 8px; overflow: hidden; background: rgba(var(--v-theme-surface), 0.42); }
.panel-toolbar { display: flex; align-items: center; justify-content: space-between; min-height: 62px; gap: 12px; padding: 10px 14px; border-bottom: 1px solid rgba(var(--v-border-color), 0.13); }
.panel-toolbar h2 { margin: 0; font-size: 0.88rem; letter-spacing: 0; }
.panel-toolbar p { margin: 3px 0 0; color: rgba(var(--v-theme-on-surface), 0.52); font-size: 0.68rem; }
.activity-row { display: grid; align-items: center; min-height: 55px; gap: 10px; padding: 7px 12px; border-top: 1px solid rgba(var(--v-border-color), 0.09); font-size: 0.71rem; }
.session-table .activity-row { grid-template-columns: minmax(120px, 1fr) minmax(110px, 1fr) minmax(130px, 1fr) 76px 80px 34px; }
.file-table .activity-row { grid-template-columns: minmax(180px, 1.6fr) minmax(100px, 0.8fr) minmax(110px, 0.9fr) 92px 64px 34px; }
.table-header { min-height: 32px; border-top: 0; background: rgba(var(--v-theme-on-surface), 0.035); color: rgba(var(--v-theme-on-surface), 0.5); font-size: 0.64rem; font-weight: 650; }
.activity-row > div { display: flex; flex-direction: column; min-width: 0; }
.activity-row b, .activity-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.activity-row small { color: rgba(var(--v-theme-on-surface), 0.48); font-size: 0.62rem; }
.protocol-cell small { white-space: normal; }
.selectable-text { user-select: text; }
.compact-empty { display: grid; place-items: center; min-height: 112px; padding: 16px; color: rgba(var(--v-theme-on-surface), 0.5); font-size: 0.72rem; }
.error-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.dialog-card { border-radius: 8px; }
.target-detail { margin-top: 12px; padding: 8px 10px; border-radius: 5px; background: rgba(var(--v-theme-on-surface), 0.045); font-size: 0.72rem; overflow-wrap: anywhere; }
@media (max-width: 900px) {
  .session-table .activity-row { grid-template-columns: minmax(120px, 1fr) minmax(110px, 1fr) minmax(130px, 1fr) 60px 34px; }
  .session-table .activity-row > :nth-child(5) { display: none; }
  .file-table .activity-row { grid-template-columns: minmax(170px, 1.5fr) minmax(100px, 0.8fr) minmax(100px, 0.8fr) 60px 34px; }
  .file-table .activity-row > :nth-child(4) { display: none; }
}
@media (max-width: 650px) {
  .table-header { display: none; }
  .session-table .activity-row, .file-table .activity-row { grid-template-columns: minmax(0, 1fr) auto auto; gap: 6px; }
  .session-table .activity-row > :nth-child(2), .file-table .activity-row > :nth-child(2) { grid-column: 1; }
  .session-table .protocol-cell, .file-table .activity-row > :nth-child(3) { grid-column: 1; }
  .session-table .activity-row > .v-chip, .file-table .activity-row > .v-chip { grid-column: 2; grid-row: 1; }
  .session-table .activity-row > .v-btn, .file-table .activity-row > .v-btn { grid-column: 3; grid-row: 1; }
}
</style>
