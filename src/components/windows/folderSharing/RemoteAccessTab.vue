<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {writeText} from '@tauri-apps/plugin-clipboard-manager';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {
  connectRemoteShare,
  disconnectRemoteServer,
  disconnectRemoteShare,
  discoverNetworkDevices,
  listMappedDrives,
  listRemoteShares,
  openSharedFolder,
} from '@/ipc/commands.ts';
import {
  folderSharingErrorKey,
  nextAvailableDrive,
  normalizeFolderSharingError,
} from '@/utils/folder_sharing.ts';
import type {
  FolderSharingError,
  MappedDrive,
  NetworkDevice,
  RemoteShare,
} from '@/types/folder_sharing.ts';

type ConnectMode = 'temporary' | 'drive';

const {t} = useI18n();
const toast = useToast();
const serverInput = ref('');
const activeServer = ref('');
const devices = ref<NetworkDevice[]>([]);
const remoteShares = ref<RemoteShare[]>([]);
const mappedDrives = ref<MappedDrive[]>([]);
const discovering = ref(false);
const loadingShares = ref(false);
const loadingMappings = ref(false);
const discoveryError = ref('');
const browseError = ref('');
const showSpecial = ref(false);

const connectOpen = ref(false);
const connectTarget = ref<RemoteShare | null>(null);
const connectMode = ref<ConnectMode>('temporary');
const driveLetter = ref<string | null>(null);
const persistent = ref(true);
const nativePrompt = ref(true);
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const saveCredentials = ref(false);
const connecting = ref(false);
const connectError = ref<FolderSharingError | null>(null);
const conflictConfirmOpen = ref(false);
const resolvingConflict = ref(false);

const disconnectOpen = ref(false);
const disconnectTarget = ref<MappedDrive | null>(null);
const forgetPersistent = ref(true);
const forgetCredentials = ref(false);
const forceDisconnect = ref(false);
const forceDisconnectRequired = ref(false);
const disconnecting = ref(false);
const disconnectError = ref('');

const visibleRemoteShares = computed(() => remoteShares.value.filter(
  share => share.diskShare && (showSpecial.value || !share.special),
));
const availableDrives = computed(() => {
  const used = new Set(mappedDrives.value.map(drive => drive.localPath.toUpperCase()));
  return Array.from({length: 23}, (_, index) => `${String.fromCharCode('Z'.charCodeAt(0) - index)}:`)
    .filter(drive => !used.has(drive));
});
const connectValid = computed(() => {
  if (!connectTarget.value) return false;
  if (connectMode.value === 'drive' && !driveLetter.value) return false;
  if (!nativePrompt.value && (!username.value.trim() || !password.value)) return false;
  return true;
});

function errorMessage(error: unknown): string {
  const normalized = normalizeFolderSharingError(error);
  return t(folderSharingErrorKey(normalized), {message: normalized.message});
}

function serverName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.toLowerCase().startsWith('smb://')) {
    return trimmed.slice(6).split('/')[0] ?? trimmed;
  }
  return trimmed.replace(/^\\\\/, '').split('\\')[0] ?? trimmed;
}

async function discover() {
  discovering.value = true;
  discoveryError.value = '';
  try {
    devices.value = await discoverNetworkDevices();
  } catch (error) {
    discoveryError.value = errorMessage(error);
  } finally {
    discovering.value = false;
  }
}

async function loadMappings() {
  loadingMappings.value = true;
  try {
    mappedDrives.value = await listMappedDrives();
  } catch (error) {
    toast.error(errorMessage(error));
  } finally {
    loadingMappings.value = false;
  }
}

async function browse(value = serverInput.value) {
  if (!value.trim()) return;
  loadingShares.value = true;
  browseError.value = '';
  try {
    remoteShares.value = await listRemoteShares({server: value.trim()});
    activeServer.value = serverName(value);
    serverInput.value = value;
  } catch (error) {
    remoteShares.value = [];
    browseError.value = errorMessage(error);
  } finally {
    loadingShares.value = false;
  }
}

function browseDevice(device: NetworkDevice) {
  serverInput.value = device.remoteName || device.name;
  void browse(serverInput.value);
}

async function copyAddress(path: string) {
  try {
    await writeText(path);
    toast.success(t('folderSharing.remote.addressCopied'));
  } catch (error) {
    toast.error(errorMessage(error));
  }
}

async function openRemote(path: string) {
  try {
    await openSharedFolder({path});
  } catch (error) {
    toast.error(errorMessage(error));
  }
}

function showConnect(share: RemoteShare, mode: ConnectMode = 'temporary') {
  connectTarget.value = share;
  connectMode.value = mode;
  driveLetter.value = nextAvailableDrive(mappedDrives.value);
  persistent.value = true;
  nativePrompt.value = true;
  username.value = '';
  password.value = '';
  saveCredentials.value = false;
  connectError.value = null;
  connectOpen.value = true;
}

function setConnectMode(value: ConnectMode | null) {
  if (value) connectMode.value = value;
}

async function connect() {
  if (!connectValid.value || !connectTarget.value || connecting.value) return;
  connecting.value = true;
  connectError.value = null;
  const requestedPassword = password.value;
  try {
    const result = await connectRemoteShare({
      request: {
        remotePath: connectTarget.value.uncPath,
        localPath: connectMode.value === 'drive' ? driveLetter.value : null,
        username: nativePrompt.value ? null : username.value.trim(),
        password: nativePrompt.value ? null : requestedPassword,
        persistent: connectMode.value === 'drive' && persistent.value,
        prompt: nativePrompt.value,
        saveCredentials: !nativePrompt.value && saveCredentials.value,
      },
    });
    connectOpen.value = false;
    toast.success(t(connectMode.value === 'drive'
      ? 'folderSharing.remote.mapped'
      : 'folderSharing.remote.connected'));
    await loadMappings();
    if (connectMode.value === 'temporary') await openRemote(result.remotePath);
  } catch (error) {
    const normalized = normalizeFolderSharingError(error);
    if (normalized.code !== 'user_cancelled') connectError.value = normalized;
  } finally {
    password.value = '';
    connecting.value = false;
  }
}

async function resolveConflict() {
  if (!connectTarget.value || resolvingConflict.value) return;
  resolvingConflict.value = true;
  try {
    const count = await disconnectRemoteServer({
      server: connectTarget.value.uncPath,
      force: true,
      forgetCredentials: false,
    });
    conflictConfirmOpen.value = false;
    connectError.value = null;
    toast.success(t('folderSharing.remote.conflictsDisconnected', {count}));
    await loadMappings();
  } catch (error) {
    conflictConfirmOpen.value = false;
    connectError.value = normalizeFolderSharingError(error);
  } finally {
    resolvingConflict.value = false;
  }
}

function showDisconnect(mapping: MappedDrive) {
  disconnectTarget.value = mapping;
  forgetPersistent.value = mapping.persistent;
  forgetCredentials.value = false;
  forceDisconnect.value = false;
  forceDisconnectRequired.value = false;
  disconnectError.value = '';
  disconnectOpen.value = true;
}

async function disconnect() {
  if (!disconnectTarget.value || disconnecting.value) return;
  disconnecting.value = true;
  disconnectError.value = '';
  try {
    await disconnectRemoteShare({
      name: disconnectTarget.value.localPath || disconnectTarget.value.remotePath,
      remotePath: disconnectTarget.value.remotePath,
      forgetPersistent: forgetPersistent.value,
      force: forceDisconnect.value,
      forgetCredentials: forgetCredentials.value,
    });
    disconnectOpen.value = false;
    toast.success(t('folderSharing.remote.disconnected'));
    await loadMappings();
  } catch (error) {
    const normalized = normalizeFolderSharingError(error);
    if (normalized.code === 'connection_has_open_files') forceDisconnectRequired.value = true;
    if (normalized.code !== 'user_cancelled') disconnectError.value = errorMessage(normalized);
  } finally {
    disconnecting.value = false;
  }
}

onMounted(() => {
  void discover();
  void loadMappings();
});
</script>

<template>
  <div class="remote-layout">
    <section class="sharing-panel">
      <header class="panel-toolbar">
        <div>
          <h2>{{ t('folderSharing.remote.browseTitle') }}</h2>
          <p>{{ t('folderSharing.remote.browseSubtitle') }}</p>
        </div>
        <v-tooltip :text="t('folderSharing.remote.discover')">
          <template #activator="{props}">
            <v-btn v-bind="props" icon="mdi-refresh" variant="text" :loading="discovering" @click="discover" />
          </template>
        </v-tooltip>
      </header>

      <div class="browser-bar">
        <v-text-field
          v-model="serverInput"
          :placeholder="t('folderSharing.remote.addressPlaceholder')"
          prepend-inner-icon="mdi-server-network"
          variant="outlined"
          density="compact"
          hide-details
          @keydown.enter="browse()"
        />
        <v-btn color="primary" variant="flat" :loading="loadingShares" :disabled="!serverInput.trim()" @click="browse()">
          {{ t('folderSharing.remote.browse') }}
        </v-btn>
      </div>

      <v-alert v-if="discoveryError" type="info" variant="tonal" density="compact" class="mx-3 mb-3">
        {{ discoveryError }}
      </v-alert>
      <div v-if="devices.length" class="device-strip">
        <button v-for="device in devices" :key="device.remoteName" type="button" @click="browseDevice(device)">
          <v-icon icon="mdi-laptop" size="18" />
          <span>{{ device.name }}</span>
        </button>
      </div>

      <v-alert v-if="browseError" type="error" variant="tonal" density="compact" class="mx-3 mb-3">
        {{ browseError }}
      </v-alert>
      <v-skeleton-loader v-if="loadingShares" type="list-item-two-line@4" />
      <template v-else-if="activeServer">
        <div class="result-heading">
          <b>{{ activeServer }}</b>
          <v-switch
            v-if="remoteShares.some(share => share.special)"
            v-model="showSpecial"
            density="compact"
            color="primary"
            hide-details
            :label="t('folderSharing.remote.showSpecial')"
          />
        </div>
        <div v-if="visibleRemoteShares.length" class="remote-list">
          <div v-for="share in visibleRemoteShares" :key="share.uncPath" class="remote-row">
            <v-icon icon="mdi-folder-outline" size="20" />
            <div class="remote-copy">
              <b>{{ share.name }}</b>
              <span class="selectable-text">{{ share.uncPath }}</span>
              <small v-if="share.description">{{ share.description }}</small>
            </div>
            <div class="remote-actions">
              <v-tooltip :text="t('folderSharing.remote.copyAddress')">
                <template #activator="{props}">
                  <v-btn v-bind="props" icon="mdi-content-copy" size="small" variant="text" @click="copyAddress(share.uncPath)" />
                </template>
              </v-tooltip>
              <v-tooltip :text="t('folderSharing.remote.open')">
                <template #activator="{props}">
                  <v-btn v-bind="props" icon="mdi-folder-open-outline" size="small" variant="text" @click="openRemote(share.uncPath)" />
                </template>
              </v-tooltip>
              <v-btn size="small" variant="tonal" @click="showConnect(share, 'temporary')">
                {{ t('folderSharing.remote.connect') }}
              </v-btn>
              <v-btn size="small" color="primary" variant="tonal" @click="showConnect(share, 'drive')">
                {{ t('folderSharing.remote.map') }}
              </v-btn>
            </div>
          </div>
        </div>
        <div v-else class="compact-empty">{{ t('folderSharing.remote.noShares') }}</div>
      </template>
      <div v-else class="compact-empty">{{ t('folderSharing.remote.selectServer') }}</div>
    </section>

    <section class="sharing-panel">
      <header class="panel-toolbar">
        <div>
          <h2>{{ t('folderSharing.remote.mappedTitle') }}</h2>
          <p>{{ t('folderSharing.remote.mappedSubtitle') }}</p>
        </div>
        <v-tooltip :text="t('folderSharing.refresh')">
          <template #activator="{props}">
            <v-btn v-bind="props" icon="mdi-refresh" variant="text" :loading="loadingMappings" @click="loadMappings" />
          </template>
        </v-tooltip>
      </header>
      <v-skeleton-loader v-if="loadingMappings && !mappedDrives.length" type="list-item-two-line@3" />
      <div v-else-if="mappedDrives.length" class="mapping-list">
        <div v-for="mapping in mappedDrives" :key="`${mapping.localPath}:${mapping.remotePath}`" class="mapping-row">
          <strong>{{ mapping.localPath || '—' }}</strong>
          <div>
            <b class="selectable-text">{{ mapping.remotePath }}</b>
            <span>{{ mapping.persistent ? t('folderSharing.remote.persistent') : t('folderSharing.remote.sessionOnly') }}</span>
          </div>
          <v-chip size="small" :color="mapping.connected ? 'success' : 'warning'" variant="tonal">
            {{ t(mapping.connected ? 'folderSharing.remote.connectedStatus' : 'folderSharing.remote.rememberedStatus') }}
          </v-chip>
          <div class="mapping-actions">
            <v-btn icon="mdi-folder-open-outline" size="small" variant="text" @click="openRemote(mapping.remotePath)" />
            <v-btn icon="mdi-delete-outline" size="small" color="error" variant="text" @click="showDisconnect(mapping)" />
          </div>
        </div>
      </div>
      <div v-else class="compact-empty">{{ t('folderSharing.remote.noMappings') }}</div>
    </section>

    <v-dialog v-model="connectOpen" max-width="560" persistent>
      <v-card class="dialog-card">
        <v-card-title>{{ t('folderSharing.remote.connectTitle', {name: connectTarget?.name ?? ''}) }}</v-card-title>
        <v-card-text class="connect-form">
          <v-alert v-if="connectError" type="error" variant="tonal" density="compact">
            <div class="error-action">
              <span>{{ errorMessage(connectError) }}</span>
              <v-btn
                v-if="connectError.code === 'credential_conflict'"
                size="small"
                color="error"
                variant="tonal"
                @click="conflictConfirmOpen = true"
              >
                {{ t('folderSharing.remote.resolveConflict') }}
              </v-btn>
            </div>
          </v-alert>

          <div class="target-path selectable-text">{{ connectTarget?.uncPath }}</div>
          <v-btn-toggle
            :model-value="connectMode"
            mandatory
            density="compact"
            variant="outlined"
            @update:model-value="setConnectMode"
          >
            <v-btn value="temporary">{{ t('folderSharing.remote.temporary') }}</v-btn>
            <v-btn value="drive">{{ t('folderSharing.remote.mapDrive') }}</v-btn>
          </v-btn-toggle>

          <div v-if="connectMode === 'drive'" class="drive-options">
            <v-select
              v-model="driveLetter"
              :items="availableDrives"
              :label="t('folderSharing.remote.driveLetter')"
              variant="outlined"
              density="compact"
              hide-details
            />
            <v-switch v-model="persistent" color="primary" hide-details :label="t('folderSharing.remote.reconnectAtLogin')" />
          </div>

          <v-switch v-model="nativePrompt" color="primary" hide-details :label="t('folderSharing.remote.nativeCredentials')" />
          <p class="field-help">{{ t('folderSharing.remote.nativeCredentialsHint') }}</p>

          <template v-if="!nativePrompt">
            <v-text-field
              v-model="username"
              :label="t('folderSharing.remote.username')"
              placeholder="HOST\username"
              variant="outlined"
              density="compact"
              hide-details="auto"
              autocomplete="off"
            />
            <v-text-field
              v-model="password"
              :label="t('folderSharing.remote.password')"
              :type="showPassword ? 'text' : 'password'"
              :append-inner-icon="showPassword ? 'mdi-eye-closed' : 'mdi-eye'"
              variant="outlined"
              density="compact"
              hide-details="auto"
              autocomplete="new-password"
              @click:append-inner="showPassword = !showPassword"
            />
            <v-switch v-model="saveCredentials" color="warning" hide-details :label="t('folderSharing.remote.saveCredentials')" />
            <v-alert v-if="saveCredentials" type="warning" variant="tonal" density="compact">
              {{ t('folderSharing.remote.saveCredentialsHint') }}
            </v-alert>
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="connecting" @click="connectOpen = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" :loading="connecting" :disabled="!connectValid" @click="connect">
            {{ t(connectMode === 'drive' ? 'folderSharing.remote.map' : 'folderSharing.remote.connect') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="conflictConfirmOpen" max-width="470">
      <v-card class="dialog-card">
        <v-card-title>{{ t('folderSharing.remote.conflictTitle') }}</v-card-title>
        <v-card-text>
          <v-alert type="warning" variant="tonal" density="compact">
            {{ t('folderSharing.remote.conflictBody', {server: serverName(connectTarget?.uncPath ?? '')}) }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="conflictConfirmOpen = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="error" variant="flat" :loading="resolvingConflict" @click="resolveConflict">
            {{ t('folderSharing.remote.disconnectExisting') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="disconnectOpen" max-width="500" persistent>
      <v-card class="dialog-card">
        <v-card-title>{{ t('folderSharing.remote.disconnectTitle') }}</v-card-title>
        <v-card-text>
          <div class="target-path selectable-text mb-3">{{ disconnectTarget?.remotePath }}</div>
          <v-alert v-if="disconnectError" type="error" variant="tonal" density="compact" class="mb-3">
            {{ disconnectError }}
          </v-alert>
          <v-checkbox
            v-if="disconnectTarget?.persistent"
            v-model="forgetPersistent"
            hide-details
            :label="t('folderSharing.remote.removePersistentMapping')"
          />
          <v-checkbox v-model="forgetCredentials" hide-details :label="t('folderSharing.remote.forgetCredentials')" />
          <template v-if="forceDisconnectRequired">
            <v-checkbox v-model="forceDisconnect" color="error" hide-details :label="t('folderSharing.remote.forceDisconnect')" />
            <p class="field-help danger-text">{{ t('folderSharing.remote.forceDisconnectHint') }}</p>
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="disconnecting" @click="disconnectOpen = false">{{ t('common.cancel') }}</v-btn>
          <v-btn
            color="error"
            variant="flat"
            :loading="disconnecting"
            :disabled="forceDisconnectRequired && !forceDisconnect"
            @click="disconnect"
          >
            {{ t('folderSharing.remote.disconnect') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.remote-layout { display: flex; flex-direction: column; gap: 12px; }
.sharing-panel { border: 1px solid rgba(var(--v-border-color), 0.14); border-radius: 8px; overflow: hidden; background: rgba(var(--v-theme-surface), 0.42); }
.panel-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-height: 65px; padding: 11px 14px; border-bottom: 1px solid rgba(var(--v-border-color), 0.13); }
.panel-toolbar h2 { margin: 0; font-size: 0.9rem; letter-spacing: 0; }
.panel-toolbar p { margin: 3px 0 0; color: rgba(var(--v-theme-on-surface), 0.54); font-size: 0.69rem; }
.browser-bar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; padding: 12px; }
.device-strip { display: flex; gap: 6px; padding: 0 12px 12px; overflow-x: auto; }
.device-strip button { display: inline-flex; align-items: center; min-width: 112px; height: 34px; gap: 7px; padding: 0 10px; border: 1px solid rgba(var(--v-border-color), 0.14); border-radius: 6px; background: rgba(var(--v-theme-on-surface), 0.025); color: inherit; font: inherit; font-size: 0.72rem; cursor: pointer; }
.device-strip button:hover { border-color: rgba(var(--v-theme-primary), 0.4); color: rgb(var(--v-theme-primary)); }
.result-heading { display: flex; align-items: center; justify-content: space-between; min-height: 42px; padding: 5px 13px; border-top: 1px solid rgba(var(--v-border-color), 0.11); background: rgba(var(--v-theme-on-surface), 0.025); font-size: 0.76rem; }
.result-heading :deep(.v-label) { font-size: 0.68rem; }
.remote-row { display: grid; grid-template-columns: 24px minmax(130px, 1fr) auto; align-items: center; gap: 8px; min-height: 60px; padding: 8px 12px; border-top: 1px solid rgba(var(--v-border-color), 0.09); }
.remote-copy { display: flex; flex-direction: column; min-width: 0; }
.remote-copy b { font-size: 0.77rem; }
.remote-copy span, .remote-copy small { overflow: hidden; color: rgba(var(--v-theme-on-surface), 0.53); font-size: 0.65rem; text-overflow: ellipsis; white-space: nowrap; }
.remote-actions, .mapping-actions { display: flex; align-items: center; gap: 3px; }
.mapping-row { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto 82px; align-items: center; gap: 10px; min-height: 56px; padding: 7px 12px; border-top: 1px solid rgba(var(--v-border-color), 0.09); font-size: 0.72rem; }
.mapping-row > strong { font-size: 0.92rem; color: rgb(var(--v-theme-primary)); }
.mapping-row > div:nth-child(2) { display: flex; flex-direction: column; min-width: 0; }
.mapping-row b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mapping-row span { color: rgba(var(--v-theme-on-surface), 0.5); font-size: 0.64rem; }
.compact-empty { display: grid; place-items: center; min-height: 112px; padding: 16px; color: rgba(var(--v-theme-on-surface), 0.5); font-size: 0.72rem; text-align: center; }
.selectable-text { user-select: text; }
.dialog-card { border-radius: 8px; }
.connect-form { display: flex; flex-direction: column; gap: 12px; }
.target-path { padding: 8px 10px; border: 1px solid rgba(var(--v-border-color), 0.13); border-radius: 5px; background: rgba(var(--v-theme-on-surface), 0.035); font-family: ui-monospace, Consolas, monospace; font-size: 0.72rem; overflow-wrap: anywhere; }
.drive-options { display: grid; grid-template-columns: 120px minmax(0, 1fr); align-items: center; gap: 12px; }
.field-help { margin: -8px 0 0 40px; color: rgba(var(--v-theme-on-surface), 0.5); font-size: 0.67rem; line-height: 1.45; }
.danger-text { color: rgb(var(--v-theme-error)); }
.error-action { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
@media (max-width: 700px) {
  .remote-row { grid-template-columns: 24px minmax(0, 1fr); }
  .remote-actions { grid-column: 1 / -1; justify-content: flex-end; }
  .mapping-row { grid-template-columns: 42px minmax(0, 1fr) auto; }
  .mapping-row > .v-chip { grid-column: 2; justify-self: start; }
  .mapping-actions { grid-column: 3; grid-row: 1 / span 2; }
}
@media (max-width: 520px) {
  .browser-bar { grid-template-columns: 1fr; }
  .panel-toolbar { align-items: flex-start; }
  .remote-actions { flex-wrap: wrap; }
  .drive-options { grid-template-columns: 1fr; }
}
</style>
