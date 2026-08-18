<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {writeText} from '@tauri-apps/plugin-clipboard-manager';
import {openUrl} from '@tauri-apps/plugin-opener';
import {useWindowsUserStore} from '@/stores/windows_user.ts';
import type {WindowsUser} from '@/types/windows.ts';
import {
  addRdpUser,
  createRdpLocalUser,
  deleteWindowsUser,
  modifyWindowsUserPassword,
  openMsSettingsPage,
  removeRdpUser,
  renameWindowsUser,
} from '@/ipc/commands.ts';

const MICROSOFT_PASSWORD_RESET_URL = 'https://account.live.com/password/reset';

const {t} = useI18n();
const toast = useToast();
const store = useWindowsUserStore();

const showMicrosoftGuide = ref(false);
const microsoftEmail = ref('');
const rowAction = ref('');
const showCreateDialog = ref(false);
const showModifyDialog = ref(false);
const showRenameDialog = ref(false);
const showPassword = ref(false);
const actionLoading = ref(false);

const newUsername = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const modifyUsername = ref('');
const modifyPasswordValue = ref('');
const renameOldName = ref('');
const renameNewName = ref('');

const visibleUsers = computed(() => store.users
  .filter(user => user.enabled && (!user.is_system || user.is_current))
  .slice()
  .sort((left, right) => Number(right.is_current) - Number(left.is_current)
    || left.name.localeCompare(right.name)));

const microsoftUsers = computed(() => visibleUsers.value
  .filter(user => user.account_kind === 'microsoft'));

const microsoftRdpUsername = computed(() => {
  const email = microsoftEmail.value.trim().replace(/^MicrosoftAccount\\/i, '');
  return email ? `MicrosoftAccount\\${email}` : '';
});

watch(() => microsoftUsers.value.length, (count, previous) => {
  if (count > 0 && !previous) showMicrosoftGuide.value = true;
}, {immediate: true});

function userKey(user: WindowsUser): string {
  return user.sid || user.name;
}

function accountKindLabel(user: WindowsUser): string {
  return t(`rdp.user.accountKinds.${user.account_kind}`);
}

function accountLoginName(user: WindowsUser): string {
  return user.rdp_username || user.account_name;
}

function nextRemoteUsername(): string {
  const existing = new Set(store.users.map(user => user.name.toLocaleLowerCase()));
  let suffix = 1;
  let candidate = 'RemoteUser';
  while (existing.has(candidate.toLocaleLowerCase())) {
    suffix += 1;
    candidate = `RemoteUser${suffix}`;
  }
  return candidate;
}

function clearCreateSecrets() {
  newPassword.value = '';
  confirmPassword.value = '';
  showPassword.value = false;
}

function openCreateDialog() {
  newUsername.value = nextRemoteUsername();
  clearCreateSecrets();
  showCreateDialog.value = true;
}

function setCreateDialog(open: boolean) {
  showCreateDialog.value = open;
  if (!open) clearCreateSecrets();
}

async function createRemoteUser() {
  if (!newUsername.value.trim() || !newPassword.value) {
    toast.error(t('rdp.user.fillRequired'));
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    toast.error(t('rdp.user.passwordMismatch'));
    return;
  }

  actionLoading.value = true;
  try {
    await createRdpLocalUser({username: newUsername.value.trim(), password: newPassword.value});
    toast.success(t('rdp.user.remoteAccountCreated', {name: newUsername.value.trim()}));
    setCreateDialog(false);
    await store.loadUsers();
  } catch (error: unknown) {
    toast.error(String(error));
  } finally {
    actionLoading.value = false;
  }
}

async function toggleRdpUser(user: WindowsUser) {
  const key = `${userKey(user)}:rdp`;
  if (rowAction.value) return;
  rowAction.value = key;
  try {
    if (user.is_rdp_user) {
      await removeRdpUser({username: user.name});
      toast.success(t('rdp.rdpUser.removedFor', {name: user.name}));
    } else {
      await addRdpUser({username: user.name});
      toast.success(t('rdp.rdpUser.addedFor', {name: user.name}));
    }
    await store.loadUsers();
  } catch (error: unknown) {
    toast.error(String(error));
  } finally {
    rowAction.value = '';
  }
}

async function copyLoginName(value: string) {
  if (!value) return;
  try {
    await writeText(value);
    toast.success(t('rdp.user.loginNameCopied'));
  } catch (error: unknown) {
    toast.error(String(error));
  }
}

async function openAccountInfo() {
  try {
    await openMsSettingsPage({uri: 'ms-settings:yourinfo'});
  } catch (error: unknown) {
    toast.error(String(error));
  }
}

async function openPasswordReset() {
  try {
    await openUrl(MICROSOFT_PASSWORD_RESET_URL);
  } catch (error: unknown) {
    toast.error(String(error));
  }
}

function openModifyDialog(user: WindowsUser) {
  modifyUsername.value = user.name;
  modifyPasswordValue.value = '';
  showPassword.value = false;
  showModifyDialog.value = true;
}

async function submitPasswordChange() {
  if (!modifyPasswordValue.value) {
    toast.error(t('rdp.user.fillNewPassword'));
    return;
  }
  actionLoading.value = true;
  try {
    await modifyWindowsUserPassword({
      username: modifyUsername.value,
      newPassword: modifyPasswordValue.value,
    });
    toast.success(t('rdp.user.modifyPasswordSuccess'));
    showModifyDialog.value = false;
    modifyPasswordValue.value = '';
  } catch (error: unknown) {
    toast.error(String(error));
  } finally {
    actionLoading.value = false;
  }
}

function openRenameDialog(user: WindowsUser) {
  renameOldName.value = user.name;
  renameNewName.value = user.name;
  showRenameDialog.value = true;
}

async function renameUser() {
  const nextName = renameNewName.value.trim();
  if (!nextName) {
    toast.error(t('rdp.user.fillNewName'));
    return;
  }
  actionLoading.value = true;
  try {
    await renameWindowsUser({oldName: renameOldName.value, newName: nextName});
    toast.success(t('rdp.user.renameSuccess'));
    showRenameDialog.value = false;
    await store.loadUsers();
  } catch (error: unknown) {
    toast.error(String(error));
  } finally {
    actionLoading.value = false;
  }
}

async function deleteUser(user: WindowsUser) {
  if (user.is_current || !confirm(t('rdp.user.deleteConfirm', {name: user.name}))) return;
  rowAction.value = `${userKey(user)}:delete`;
  try {
    await deleteWindowsUser({username: user.name});
    toast.success(t('rdp.user.deleteSuccess'));
    await store.loadUsers();
  } catch (error: unknown) {
    toast.error(String(error));
  } finally {
    rowAction.value = '';
  }
}
</script>

<template>
  <v-card variant="flat" class="rdp-card rdp-access-card">
    <v-card-title class="text-subtitle-1 font-weight-medium pb-1">
      {{ t('rdp.user.accessTitle') }}
    </v-card-title>
    <v-card-subtitle class="text-caption">
      {{ t('rdp.user.accessSubtitle') }}
    </v-card-subtitle>

    <v-card-text class="rdp-access-body">
      <div class="credential-paths">
        <div class="credential-path">
          <span class="credential-path-icon" aria-hidden="true">
            <v-icon icon="mdi-account-plus" size="19" />
          </span>
          <div class="credential-path-copy">
            <div class="credential-path-title">
              <strong>{{ t('rdp.user.dedicatedAccountTitle') }}</strong>
              <v-chip color="primary" variant="tonal" size="x-small">
                {{ t('rdp.user.recommended') }}
              </v-chip>
            </div>
            <p>{{ t('rdp.user.dedicatedAccountHint') }}</p>
          </div>
          <v-btn color="primary" variant="tonal" size="small" prepend-icon="mdi-account-plus" @click="openCreateDialog">
            {{ t('rdp.user.createRemoteAccount') }}
          </v-btn>
        </div>

        <div class="credential-path credential-path--microsoft">
          <span class="credential-path-icon" aria-hidden="true">
            <v-icon icon="mdi-microsoft-windows" size="20" />
          </span>
          <div class="credential-path-copy">
            <div class="credential-path-title">
              <strong>{{ t('rdp.user.microsoftAccountTitle') }}</strong>
              <v-chip v-if="microsoftUsers.length" color="primary" variant="outlined" size="x-small">
                {{ t('rdp.user.detected') }}
              </v-chip>
            </div>
            <p>{{ t('rdp.user.microsoftAccountHint') }}</p>
          </div>
          <v-btn
            variant="text"
            size="small"
            :prepend-icon="showMicrosoftGuide ? 'mdi-chevron-up' : 'mdi-chevron-down'"
            @click="showMicrosoftGuide = !showMicrosoftGuide"
          >
            {{ t('rdp.user.microsoftAccountAction') }}
          </v-btn>
        </div>
      </div>

      <v-expand-transition>
        <div v-if="showMicrosoftGuide" class="microsoft-guide">
          <div class="microsoft-guide-fields">
            <v-text-field
              v-model="microsoftEmail"
              class="mx-standard-field"
              :label="t('rdp.user.microsoftEmail')"
              placeholder="name@example.com"
              variant="outlined"
              density="default"
              hide-details="auto"
              autocomplete="username"
            />
            <div class="login-preview" :class="{'login-preview--empty': !microsoftRdpUsername}">
              <span>{{ t('rdp.user.rdpLoginName') }}</span>
              <code>{{ microsoftRdpUsername || 'MicrosoftAccount\\name@example.com' }}</code>
              <v-btn
                class="mx-compact-icon-button"
                icon="mdi-content-copy"
                size="small"
                variant="text"
                :disabled="!microsoftRdpUsername"
                :title="t('rdp.user.copyLoginName')"
                :aria-label="t('rdp.user.copyLoginName')"
                @click="copyLoginName(microsoftRdpUsername)"
              />
            </div>
          </div>
          <p class="microsoft-password-note">
            <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
            {{ t('rdp.user.microsoftPasswordHint') }}
          </p>
          <div class="microsoft-guide-actions">
            <v-btn variant="text" size="small" prepend-icon="mdi-microsoft-windows" @click="openAccountInfo">
              {{ t('rdp.user.openAccountInfo') }}
            </v-btn>
            <v-btn variant="text" size="small" prepend-icon="mdi-open-in-new" @click="openPasswordReset">
              {{ t('rdp.user.resetMicrosoftPassword') }}
            </v-btn>
          </div>
        </div>
      </v-expand-transition>

      <div class="account-list-heading">
        <div>
          <strong>{{ t('rdp.user.accountsOnThisPc') }}</strong>
          <span>{{ t('rdp.user.accountsOnThisPcHint') }}</span>
        </div>
        <span v-if="store.loading" class="text-caption text-medium-emphasis">
          {{ t('rdp.user.refreshing') }}
        </span>
      </div>

      <div v-if="visibleUsers.length" class="account-list">
        <div v-for="user in visibleUsers" :key="userKey(user)" class="account-row">
          <span class="account-avatar" aria-hidden="true">
            <v-icon :icon="user.account_kind === 'microsoft' ? 'mdi-microsoft-windows' : 'mdi-account'" size="18" />
          </span>
          <div class="account-copy">
            <div class="account-title-line">
              <strong>{{ user.full_name || user.name }}</strong>
              <span v-if="user.full_name" class="account-alias">{{ user.name }}</span>
              <v-chip v-if="user.is_current" size="x-small" variant="tonal" color="primary">
                {{ t('rdp.user.current') }}
              </v-chip>
              <v-chip size="x-small" variant="outlined">
                {{ accountKindLabel(user) }}
              </v-chip>
            </div>
            <div class="account-login-line">
              <span>{{ t('rdp.user.rdpLoginName') }}</span>
              <code v-if="user.rdp_username">{{ accountLoginName(user) }}</code>
              <em v-else>{{ t('rdp.user.microsoftEmailRequired') }}</em>
            </div>
          </div>
          <div class="account-actions">
            <v-chip v-if="user.is_administrator" color="primary" variant="tonal" size="small" prepend-icon="mdi-account-check">
              {{ t('rdp.user.allowedAsAdmin') }}
            </v-chip>
            <v-btn
              v-else
              size="small"
              :variant="user.is_rdp_user ? 'tonal' : 'text'"
              :color="user.is_rdp_user ? 'primary' : undefined"
              :prepend-icon="user.is_rdp_user ? 'mdi-account-check' : 'mdi-account-outline'"
              :loading="rowAction === `${userKey(user)}:rdp`"
              @click="toggleRdpUser(user)"
            >
              {{ t(user.is_rdp_user ? 'rdp.user.remoteAllowed' : 'rdp.user.allowRemote') }}
            </v-btn>
            <v-btn
              v-if="user.rdp_username"
              class="mx-compact-icon-button"
              icon="mdi-content-copy"
              size="small"
              variant="text"
              :title="t('rdp.user.copyLoginName')"
              :aria-label="t('rdp.user.copyLoginName')"
              @click="copyLoginName(accountLoginName(user))"
            />
            <template v-if="user.can_manage_locally">
              <v-btn
                class="mx-compact-icon-button"
                icon="mdi-pencil"
                size="small"
                variant="text"
                :title="t('rdp.user.rename')"
                :aria-label="t('rdp.user.rename')"
                @click="openRenameDialog(user)"
              />
              <v-btn
                class="mx-compact-icon-button"
                icon="mdi-lock-reset"
                size="small"
                variant="text"
                :title="t('rdp.user.modifyPassword')"
                :aria-label="t('rdp.user.modifyPassword')"
                @click="openModifyDialog(user)"
              />
              <v-btn
                class="mx-compact-icon-button"
                icon="mdi-delete"
                size="small"
                variant="text"
                color="error"
                :disabled="user.is_current"
                :loading="rowAction === `${userKey(user)}:delete`"
                :title="user.is_current ? t('rdp.user.currentCannotDelete') : t('rdp.user.delete')"
                :aria-label="t('rdp.user.delete')"
                @click="deleteUser(user)"
              />
            </template>
          </div>
        </div>
      </div>
      <p v-else class="account-empty">{{ t('rdp.user.empty') }}</p>
    </v-card-text>

    <v-dialog :model-value="showCreateDialog" max-width="480" persistent @update:model-value="setCreateDialog">
      <v-card :title="t('rdp.user.createRemoteAccountTitle')">
        <v-card-text>
          <v-alert type="info" variant="tonal" density="compact" class="mb-4">
            {{ t('rdp.user.createRemoteAccountHint') }}
          </v-alert>
          <v-text-field
            v-model="newUsername"
            class="mx-standard-field mb-3"
            :label="t('rdp.user.username')"
            variant="outlined"
            density="default"
            hide-details="auto"
            autocomplete="off"
          />
          <v-text-field
            v-model="newPassword"
            class="mx-standard-field mb-3"
            :label="t('rdp.user.password')"
            :type="showPassword ? 'text' : 'password'"
            :append-inner-icon="showPassword ? 'mdi-eye-closed' : 'mdi-eye'"
            variant="outlined"
            density="default"
            hide-details="auto"
            autocomplete="new-password"
            @click:append-inner="showPassword = !showPassword"
          />
          <v-text-field
            v-model="confirmPassword"
            class="mx-standard-field"
            :label="t('rdp.user.confirmPassword')"
            :type="showPassword ? 'text' : 'password'"
            variant="outlined"
            density="default"
            hide-details="auto"
            autocomplete="new-password"
          />
          <p class="dialog-security-note">{{ t('rdp.user.passwordStorageHint') }}</p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="actionLoading" @click="setCreateDialog(false)">
            {{ t('common.cancel') }}
          </v-btn>
          <v-btn color="primary" variant="flat" :loading="actionLoading" @click="createRemoteUser">
            {{ t('rdp.user.createAndAllow') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showModifyDialog" max-width="420" persistent>
      <v-card :title="t('rdp.user.modifyPasswordTitle')">
        <v-card-text>
          <p class="text-body-2 mb-3">{{ t('rdp.user.modifyPasswordFor') }} <strong>{{ modifyUsername }}</strong></p>
          <v-text-field
            v-model="modifyPasswordValue"
            class="mx-standard-field"
            :label="t('rdp.user.newPassword')"
            :type="showPassword ? 'text' : 'password'"
            :append-inner-icon="showPassword ? 'mdi-eye-closed' : 'mdi-eye'"
            variant="outlined"
            density="default"
            autocomplete="new-password"
            @click:append-inner="showPassword = !showPassword"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="actionLoading" @click="showModifyDialog = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" :loading="actionLoading" @click="submitPasswordChange">{{ t('common.confirm') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showRenameDialog" max-width="420" persistent>
      <v-card :title="t('rdp.user.renameTitle')">
        <v-card-text>
          <p class="text-body-2 mb-3">{{ t('rdp.user.renameFrom') }} <strong>{{ renameOldName }}</strong></p>
          <v-text-field
            v-model="renameNewName"
            class="mx-standard-field"
            :label="t('rdp.user.newName')"
            variant="outlined"
            density="default"
            autocomplete="off"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="actionLoading" @click="showRenameDialog = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" :loading="actionLoading" @click="renameUser">{{ t('common.confirm') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<style scoped>
.rdp-access-body {
  padding-top: 12px;
}

.credential-paths,
.account-list {
  border-block: 1px solid rgba(var(--v-border-color), 0.1);
}

.credential-path {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 68px;
  padding: 10px 0;
}

.credential-path + .credential-path {
  border-top: 1px solid rgba(var(--v-border-color), 0.08);
}

.credential-path-icon,
.account-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--app-radius-sm);
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.09);
}

.credential-path-copy,
.account-copy {
  min-width: 0;
}

.credential-path-title,
.account-title-line,
.account-login-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.credential-path-title strong,
.account-title-line strong,
.account-list-heading strong {
  font-size: 0.82rem;
  font-weight: 600;
}

.credential-path-copy p,
.account-list-heading span,
.account-login-line,
.account-alias {
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.7rem;
}

.credential-path-copy p {
  margin: 3px 0 0;
  line-height: 1.45;
}

.microsoft-guide {
  margin-left: 44px;
  padding: 12px 0 14px;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.1);
}

.microsoft-guide-fields {
  display: grid;
  grid-template-columns: minmax(180px, 0.85fr) minmax(250px, 1.15fr);
  align-items: start;
  gap: 10px;
}

.login-preview {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 28px;
  align-items: center;
  gap: 8px;
  min-height: var(--app-control-height-field);
  padding-left: 10px;
  border: 1px solid rgba(var(--v-border-color), 0.18);
  border-radius: var(--app-radius-sm);
}

.login-preview span {
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.68rem;
}

.login-preview code,
.account-login-line code {
  min-width: 0;
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.7rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.login-preview--empty code {
  color: rgba(var(--v-theme-on-surface), 0.42);
}

.microsoft-password-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 9px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.68);
  font-size: 0.72rem;
  line-height: 1.45;
}

.microsoft-guide-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.account-list-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 0 8px;
}

.account-list-heading > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.account-row {
  display: grid;
  grid-template-columns: 34px minmax(180px, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 66px;
  padding: 8px 0;
}

.account-row + .account-row {
  border-top: 1px solid rgba(var(--v-border-color), 0.08);
}

.account-login-line {
  margin-top: 4px;
}

.account-login-line em {
  font-style: normal;
}

.account-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}

.account-empty {
  margin: 0;
  padding: 18px 0 4px;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.75rem;
}

.dialog-security-note {
  margin: 10px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.7rem;
  line-height: 1.45;
}

@media (max-width: 760px) {
  .credential-path,
  .account-row {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .credential-path > .v-btn,
  .account-actions {
    grid-column: 2;
    justify-self: start;
  }

  .account-actions {
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .microsoft-guide {
    margin-left: 0;
  }

  .microsoft-guide-fields {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .credential-path,
  .account-row {
    grid-template-columns: 1fr;
  }

  .credential-path-icon,
  .account-avatar {
    display: none;
  }

  .credential-path > .v-btn,
  .account-actions {
    grid-column: 1;
  }

  .login-preview {
    grid-template-columns: 1fr 28px;
  }

  .login-preview span {
    grid-column: 1 / -1;
    padding-top: 6px;
  }
}
</style>
