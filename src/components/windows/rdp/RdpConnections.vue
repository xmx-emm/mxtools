<script setup lang="ts">
import {computed, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {writeText} from '@tauri-apps/plugin-clipboard-manager';
import {save} from '@tauri-apps/plugin-dialog';
import {useRdpStore} from '@/stores/rdp.ts';
import type {RdpConnection} from '@/types/rdp.ts';
import {connectRdp, exportRdpFile} from '@/ipc/commands.ts';

type CredentialMode = 'prompt' | 'local' | 'microsoft' | 'organization';
type DialogMode = 'add' | 'edit';

const {t} = useI18n();
const toast = useToast();
const store = useRdpStore();

const showDialog = ref(false);
const dialogMode = ref<DialogMode>('add');
const editIndex = ref(-1);
const connecting = ref<number | null>(null);
const savingConnection = ref(false);
const credentialMode = ref<CredentialMode>('prompt');
const credentialValue = ref('');

const form = ref<RdpConnection>({
  name: '',
  ip: '',
  port: 3389,
  username: '',
});

const usernamePreview = computed(() => normalizeUsername(credentialMode.value, credentialValue.value));

function normalizeUsername(mode: CredentialMode, input: string): string {
  const value = input.trim();
  if (mode === 'prompt' || !value) return '';
  if (mode === 'microsoft') {
    return value.toLocaleLowerCase().startsWith('microsoftaccount\\')
      ? value
      : `MicrosoftAccount\\${value}`;
  }
  if (mode === 'local') {
    return value.startsWith('.\\') || value.includes('\\') ? value : `.\\${value}`;
  }
  return value;
}

function parseUsername(username: string): {mode: CredentialMode; value: string} {
  const value = username.trim();
  if (!value) return {mode: 'prompt', value: ''};
  if (value.toLocaleLowerCase().startsWith('microsoftaccount\\')) {
    return {mode: 'microsoft', value: value.slice(value.indexOf('\\') + 1)};
  }
  if (value.startsWith('.\\')) {
    return {mode: 'local', value: value.slice(2)};
  }
  if (!value.includes('\\') && !value.includes('@')) {
    return {mode: 'local', value};
  }
  return {mode: 'organization', value};
}

function resetForm() {
  form.value = {name: '', ip: '', port: 3389, username: ''};
  credentialMode.value = 'prompt';
  credentialValue.value = '';
}

function openAddDialog() {
  resetForm();
  dialogMode.value = 'add';
  editIndex.value = -1;
  showDialog.value = true;
}

function openEditDialog(index: number) {
  const connection = store.connections[index];
  if (!connection) return;
  form.value = {...connection};
  const parsed = parseUsername(connection.username);
  credentialMode.value = parsed.mode;
  credentialValue.value = parsed.value;
  dialogMode.value = 'edit';
  editIndex.value = index;
  showDialog.value = true;
}

function validateForm(): boolean {
  if (!form.value.name.trim() || !form.value.ip.trim()) {
    toast.error(t('rdp.connect.fillRequired'));
    return false;
  }
  if (!Number.isInteger(form.value.port) || form.value.port < 1 || form.value.port > 65535) {
    toast.error(t('rdp.port.invalidPort'));
    return false;
  }
  if (credentialMode.value !== 'prompt' && !credentialValue.value.trim()) {
    toast.error(t('rdp.connect.accountRequired'));
    return false;
  }
  if (credentialMode.value === 'microsoft' && !credentialValue.value.includes('@')) {
    toast.error(t('rdp.connect.microsoftEmailInvalid'));
    return false;
  }
  return true;
}

async function persistConnection() {
  if (!validateForm()) return;

  const next: RdpConnection = {
    name: form.value.name.trim(),
    ip: form.value.ip.trim(),
    port: form.value.port,
    username: usernamePreview.value,
  };
  const previous = dialogMode.value === 'edit' && editIndex.value >= 0
    ? {...store.connections[editIndex.value]}
    : null;

  savingConnection.value = true;
  try {
    if (dialogMode.value === 'add') {
      store.connections.push(next);
    } else {
      store.connections[editIndex.value] = next;
    }
    await store.saveConnections();
    showDialog.value = false;
    toast.success(t(dialogMode.value === 'add' ? 'rdp.connect.addSuccess' : 'rdp.connect.editSuccess'));
  } catch (error: unknown) {
    if (dialogMode.value === 'add') {
      store.connections.pop();
    } else if (previous) {
      store.connections[editIndex.value] = previous;
    }
    toast.error(String(error) || t('rdp.connect.saveFailed'));
  } finally {
    savingConnection.value = false;
  }
}

async function deleteConnection(index: number) {
  const connection = store.connections[index];
  if (!connection || !confirm(t('rdp.connect.deleteConfirm', {name: connection.name}))) return;
  const removed = store.connections.splice(index, 1);
  try {
    await store.saveConnections();
    toast.success(t('rdp.connect.deleted'));
  } catch (error: unknown) {
    if (removed[0]) store.connections.splice(index, 0, removed[0]);
    toast.error(String(error) || t('rdp.connect.saveFailed'));
  }
}

async function connectTo(connection: RdpConnection, index: number) {
  connecting.value = index;
  try {
    await connectRdp({
      ip: connection.ip,
      port: connection.port,
      username: connection.username || null,
    });
  } catch (error: unknown) {
    toast.error(String(error));
  } finally {
    connecting.value = null;
  }
}

async function exportRdp(connection: RdpConnection) {
  try {
    const path = await save({
      defaultPath: `${connection.name}.rdp`,
      filters: [{name: 'RDP File', extensions: ['rdp']}],
    });
    if (!path) return;
    await exportRdpFile({connection, path});
    toast.success(t('rdp.connect.exportSuccess'));
  } catch (error: unknown) {
    toast.error(String(error));
  }
}

async function copyUsername() {
  if (!usernamePreview.value) return;
  try {
    await writeText(usernamePreview.value);
    toast.success(t('rdp.user.loginNameCopied'));
  } catch (error: unknown) {
    toast.error(String(error));
  }
}

function connectionModeKey(connection: RdpConnection): string {
  return `rdp.connect.accountModes.${parseUsername(connection.username).mode}`;
}
</script>

<template>
  <v-card variant="flat" class="rdp-card rdp-connections-card">
    <div class="connections-heading">
      <div>
        <v-card-title class="text-subtitle-1 font-weight-medium pb-1">
          {{ t('rdp.connect.title') }}
        </v-card-title>
        <v-card-subtitle class="text-caption">
          {{ t('rdp.connect.subtitle') }}
        </v-card-subtitle>
      </div>
      <v-btn color="primary" variant="tonal" size="small" prepend-icon="mdi-plus" @click="openAddDialog">
        {{ t('rdp.connect.add') }}
      </v-btn>
    </div>

    <v-card-text class="connections-body">
      <div v-if="store.connections.length" class="connection-list">
        <div
          v-for="(connection, index) in store.connections"
          :key="`${connection.name}:${connection.ip}:${index}`"
          class="connection-row"
        >
          <span class="connection-icon" aria-hidden="true"><v-icon icon="mdi-monitor" size="18" /></span>
          <div class="connection-copy">
            <strong>{{ connection.name }}</strong>
            <span>{{ connection.ip }}:{{ connection.port }}</span>
            <div class="connection-credential">
              <v-chip size="x-small" variant="outlined">{{ t(connectionModeKey(connection)) }}</v-chip>
              <code v-if="connection.username">{{ connection.username }}</code>
              <em v-else>{{ t('rdp.connect.askOnConnect') }}</em>
            </div>
          </div>
          <div class="connection-actions">
            <v-btn
              size="small"
              color="primary"
              variant="tonal"
              prepend-icon="mdi-play"
              :loading="connecting === index"
              @click="connectTo(connection, index)"
            >
              {{ t('rdp.connect.connect') }}
            </v-btn>
            <v-btn
              class="mx-compact-icon-button"
              icon="mdi-pencil"
              size="small"
              variant="text"
              :title="t('rdp.connect.edit')"
              :aria-label="t('rdp.connect.edit')"
              @click="openEditDialog(index)"
            />
            <v-btn
              class="mx-compact-icon-button"
              icon="mdi-export"
              size="small"
              variant="text"
              :title="t('rdp.connect.export')"
              :aria-label="t('rdp.connect.export')"
              @click="exportRdp(connection)"
            />
            <v-btn
              class="mx-compact-icon-button"
              icon="mdi-delete"
              size="small"
              variant="text"
              color="error"
              :title="t('rdp.connect.delete')"
              :aria-label="t('rdp.connect.delete')"
              @click="deleteConnection(index)"
            />
          </div>
        </div>
      </div>
      <div v-else class="connection-empty">
        <v-icon icon="mdi-remote-desktop" size="24" aria-hidden="true" />
        <div>
          <strong>{{ t('rdp.connect.emptyTitle') }}</strong>
          <span>{{ t('rdp.connect.empty') }}</span>
        </div>
      </div>
    </v-card-text>

    <v-dialog v-model="showDialog" max-width="560" persistent>
      <v-card :title="t(dialogMode === 'add' ? 'rdp.connect.addTitle' : 'rdp.connect.editTitle')">
        <v-card-text class="connection-form">
          <v-text-field
            v-model="form.name"
            class="mx-standard-field"
            :label="t('rdp.connect.connName')"
            variant="outlined"
            density="default"
            hide-details="auto"
            autocomplete="off"
          />
          <div class="endpoint-fields">
            <v-text-field
              v-model="form.ip"
              class="mx-standard-field"
              :label="t('rdp.portCheck.ipLabel')"
              variant="outlined"
              density="default"
              hide-details="auto"
              placeholder="192.168.1.100"
              autocomplete="off"
            />
            <v-text-field
              v-model.number="form.port"
              class="mx-standard-field"
              :label="t('rdp.port.label')"
              variant="outlined"
              density="default"
              hide-details="auto"
              type="number"
              :min="1"
              :max="65535"
            />
          </div>

          <div class="credential-mode-label">{{ t('rdp.connect.accountType') }}</div>
          <div class="credential-mode-scroll">
            <v-btn-toggle
              v-model="credentialMode"
              class="game-page-segmented-toggle"
              color="primary"
              variant="text"
              border
              divided
              density="compact"
              mandatory
            >
              <v-btn size="small" value="prompt">{{ t('rdp.connect.accountModes.prompt') }}</v-btn>
              <v-btn size="small" value="local">{{ t('rdp.connect.accountModes.local') }}</v-btn>
              <v-btn size="small" value="microsoft">{{ t('rdp.connect.accountModes.microsoft') }}</v-btn>
              <v-btn size="small" value="organization">{{ t('rdp.connect.accountModes.organization') }}</v-btn>
            </v-btn-toggle>
          </div>

          <v-alert v-if="credentialMode === 'prompt'" type="info" variant="tonal" density="compact">
            {{ t('rdp.connect.promptHint') }}
          </v-alert>
          <template v-else>
            <v-text-field
              v-model="credentialValue"
              class="mx-standard-field"
              :label="t(credentialMode === 'microsoft'
                ? 'rdp.connect.microsoftEmail'
                : credentialMode === 'local'
                  ? 'rdp.connect.localUsername'
                  : 'rdp.connect.organizationUsername')"
              :placeholder="credentialMode === 'microsoft'
                ? 'name@example.com'
                : credentialMode === 'local'
                  ? 'username'
                  : 'DOMAIN\\username / name@example.com'"
              variant="outlined"
              density="default"
              hide-details="auto"
              autocomplete="username"
            />
            <div class="username-preview" :class="{'username-preview--empty': !usernamePreview}">
              <span>{{ t('rdp.user.rdpLoginName') }}</span>
              <code>{{ usernamePreview || t('rdp.connect.enterAccount') }}</code>
              <v-btn
                class="mx-compact-icon-button"
                icon="mdi-content-copy"
                size="small"
                variant="text"
                :disabled="!usernamePreview"
                :title="t('rdp.user.copyLoginName')"
                :aria-label="t('rdp.user.copyLoginName')"
                @click="copyUsername"
              />
            </div>
            <p class="credential-hint">
              <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
              {{ t(`rdp.connect.accountHints.${credentialMode}`) }}
            </p>
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="savingConnection" @click="showDialog = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" :loading="savingConnection" @click="persistConnection">
            {{ t(dialogMode === 'add' ? 'common.confirm' : 'common.save') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<style scoped>
.connections-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-right: 16px;
}

.connections-body {
  padding-top: 12px;
}

.connection-list {
  border-block: 1px solid rgba(var(--v-border-color), 0.1);
}

.connection-row {
  display: grid;
  grid-template-columns: 34px minmax(190px, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 70px;
  padding: 8px 0;
}

.connection-row + .connection-row {
  border-top: 1px solid rgba(var(--v-border-color), 0.08);
}

.connection-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--app-radius-sm);
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.09);
}

.connection-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.connection-copy strong {
  font-size: 0.82rem;
  font-weight: 600;
}

.connection-copy > span {
  margin-top: 2px;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.7rem;
}

.connection-credential {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin-top: 5px;
}

.connection-credential code,
.connection-credential em {
  min-width: 0;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.68rem;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connection-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}

.connection-empty {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 76px;
  color: rgba(var(--v-theme-on-surface), 0.54);
}

.connection-empty div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.connection-empty strong {
  color: rgba(var(--v-theme-on-surface), 0.76);
  font-size: 0.78rem;
}

.connection-empty span {
  font-size: 0.7rem;
}

.connection-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.endpoint-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 128px;
  gap: 10px;
}

.credential-mode-label {
  margin-bottom: -7px;
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.72rem;
}

.credential-mode-scroll {
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: thin;
}

.credential-mode-scroll .v-btn-toggle {
  width: max-content;
  min-width: 100%;
}

.username-preview {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 28px;
  align-items: center;
  gap: 8px;
  min-height: var(--app-control-height-field);
  padding-left: 10px;
  border: 1px solid rgba(var(--v-border-color), 0.18);
  border-radius: var(--app-radius-sm);
}

.username-preview span {
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.68rem;
}

.username-preview code {
  min-width: 0;
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.7rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.username-preview--empty code {
  color: rgba(var(--v-theme-on-surface), 0.42);
}

.credential-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: -5px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-size: 0.7rem;
  line-height: 1.45;
}

@media (max-width: 680px) {
  .connection-row {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .connection-actions {
    grid-column: 2;
    justify-content: flex-start;
  }
}

@media (max-width: 480px) {
  .connections-heading {
    align-items: flex-end;
  }

  .connections-heading .v-btn {
    flex: 0 0 auto;
  }

  .connection-row {
    grid-template-columns: 1fr;
  }

  .connection-icon {
    display: none;
  }

  .connection-actions {
    grid-column: 1;
    flex-wrap: wrap;
  }

  .endpoint-fields {
    grid-template-columns: 1fr;
  }

  .username-preview {
    grid-template-columns: 1fr 28px;
  }

  .username-preview span {
    grid-column: 1 / -1;
    padding-top: 6px;
  }
}
</style>
