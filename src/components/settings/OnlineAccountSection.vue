<script setup lang="ts">
import {onUnmounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {openUrl} from '@tauri-apps/plugin-opener';
import {writeText} from '@tauri-apps/plugin-clipboard-manager';
import {
  onlineAuthCancelDeviceLogin,
  onlineAuthGetAccount,
  onlineAuthLogout,
  onlineAuthPollDeviceLogin,
  onlineAuthStartDeviceLogin,
} from '@/ipc/commands.ts';
import type {OnlineAccount, OnlineDeviceLoginStart} from '@/types/online.ts';

type TauriRuntimeWindow = Window & {__TAURI_INTERNALS__?: unknown};
const isTauriRuntime = typeof window !== 'undefined'
  && Boolean((window as TauriRuntimeWindow).__TAURI_INTERNALS__);

const {t} = useI18n();
const toast = useToast();

type AccountState = 'browser' | 'checking' | 'loggedOut' | 'loggedIn' | 'error';
type LoginStage = 'starting' | 'waiting' | 'denied' | 'expired' | 'failed';

const accountState = ref<AccountState>(isTauriRuntime ? 'checking' : 'browser');
const account = ref<OnlineAccount | null>(null);
const loggingOut = ref(false);

const dialogOpen = ref(false);
const loginStage = ref<LoginStage>('starting');
const loginInfo = ref<OnlineDeviceLoginStart | null>(null);
const loginError = ref('');
let pollTimer: number | null = null;
let pollGeneration = 0;

async function refreshAccount() {
  if (!isTauriRuntime) return;
  accountState.value = 'checking';
  try {
    account.value = await onlineAuthGetAccount();
    accountState.value = account.value ? 'loggedIn' : 'loggedOut';
  } catch {
    accountState.value = 'error';
  }
}

function stopPolling() {
  pollGeneration += 1;
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function schedulePoll(delaySeconds: number) {
  const generation = pollGeneration;
  pollTimer = window.setTimeout(() => {
    void pollOnce(generation);
  }, delaySeconds * 1000);
}

async function pollOnce(generation: number) {
  if (generation !== pollGeneration || !dialogOpen.value) return;
  try {
    const result = await onlineAuthPollDeviceLogin();
    if (generation !== pollGeneration) return;
    if (result.status === 'pending') {
      schedulePoll(loginInfo.value?.interval ?? 5);
      return;
    }
    if (result.status === 'slowDown') {
      schedulePoll((loginInfo.value?.interval ?? 5) + 5);
      return;
    }
    if (result.status === 'approved') {
      account.value = result.account;
      accountState.value = 'loggedIn';
      toast.success(t('settings.deviceLoginApproved'));
      closeDialog();
      return;
    }
    loginStage.value = result.status === 'denied' ? 'denied' : 'expired';
  } catch (error) {
    if (generation !== pollGeneration) return;
    loginStage.value = 'failed';
    loginError.value = String(error);
  }
}

async function startLogin() {
  dialogOpen.value = true;
  loginStage.value = 'starting';
  loginInfo.value = null;
  loginError.value = '';
  stopPolling();
  try {
    const started = await onlineAuthStartDeviceLogin();
    loginInfo.value = started;
    loginStage.value = 'waiting';
    // 自动打开授权页；失败时用户仍可用对话框里的按钮手动打开。
    void openUrl(started.verificationUriComplete).catch(() => undefined);
    schedulePoll(started.interval);
  } catch (error) {
    loginStage.value = 'failed';
    loginError.value = String(error);
  }
}

function closeDialog() {
  dialogOpen.value = false;
  stopPolling();
  void onlineAuthCancelDeviceLogin().catch(() => undefined);
}

function onDialogModel(open: boolean) {
  if (!open) closeDialog();
}

async function openVerification() {
  if (!loginInfo.value) return;
  try {
    await openUrl(loginInfo.value.verificationUriComplete);
  } catch (error) {
    toast.error(String(error));
  }
}

async function copyCode() {
  if (!loginInfo.value) return;
  try {
    await writeText(loginInfo.value.userCode);
    toast.success(t('settings.deviceLoginCopied'));
  } catch (error) {
    toast.error(String(error));
  }
}

async function logout() {
  if (loggingOut.value) return;
  loggingOut.value = true;
  try {
    await onlineAuthLogout();
    account.value = null;
    accountState.value = 'loggedOut';
    toast.success(t('settings.onlineAccountLogoutDone'));
  } catch (error) {
    toast.error(String(error));
  } finally {
    loggingOut.value = false;
  }
}

if (isTauriRuntime) void refreshAccount();
onUnmounted(stopPolling);
</script>

<template>
  <section class="app-section settings-section">
    <header class="settings-section-header online-account-header">
      <span class="settings-section-icon"><v-icon icon="mdi-account-outline" size="18"/></span>
      <div>
        <h2>
          {{ t('settings.onlineAccount') }}
          <span class="mx-beta-badge ml-1" :title="t('settings.betaFeaturesHint')">{{ t('common.beta') }}</span>
        </h2>
        <p>{{ t('settings.onlineAccountHint') }}</p>
      </div>
    </header>

    <div class="settings-rows">
      <div v-if="accountState === 'browser'" class="setting-row">
        <span><small>{{ t('settings.onlineAccountBrowserOnly') }}</small></span>
      </div>

      <div v-else-if="accountState === 'checking'" class="setting-row">
        <span><small>{{ t('settings.onlineAccountChecking') }}</small></span>
        <v-progress-circular indeterminate size="18" width="2" color="primary"/>
      </div>

      <div v-else-if="accountState === 'loggedIn' && account" class="setting-row">
        <span>
          <strong>{{ account.displayName || account.email }}</strong>
          <small>{{ account.displayName ? account.email : t('settings.onlineAccount') }}</small>
        </span>
        <v-btn
          variant="tonal"
          rounded="lg"
          size="small"
          :loading="loggingOut"
          @click="logout"
        >
          {{ t('settings.onlineAccountLogout') }}
        </v-btn>
      </div>

      <div v-else-if="accountState === 'error'" class="setting-row">
        <span><small>{{ t('settings.onlineAccountNetworkError') }}</small></span>
        <v-btn variant="tonal" rounded="lg" size="small" @click="refreshAccount">
          {{ t('settings.onlineAccountRetry') }}
        </v-btn>
      </div>

      <div v-else class="setting-row">
        <span>
          <strong>{{ t('settings.onlineAccountLoggedOut') }}</strong>
          <small>{{ t('settings.onlineAccountLoggedOutHint') }}</small>
        </span>
        <v-btn
          color="primary"
          variant="tonal"
          rounded="lg"
          size="small"
          prepend-icon="mdi-account-check"
          @click="startLogin"
        >
          {{ t('settings.onlineAccountLogin') }}
        </v-btn>
      </div>
    </div>

    <v-dialog
      :model-value="dialogOpen"
      width="440"
      :persistent="false"
      @update:model-value="onDialogModel"
    >
      <v-card>
        <v-card-title>{{ t('settings.deviceLoginTitle') }}</v-card-title>
        <v-card-text>
          <p class="device-login-intro">{{ t('settings.deviceLoginIntro') }}</p>

          <div v-if="loginStage === 'starting'" class="device-login-status">
            <v-progress-circular indeterminate size="18" width="2" color="primary"/>
            <span>{{ t('settings.onlineAccountChecking') }}</span>
          </div>

          <template v-else-if="loginStage === 'waiting' && loginInfo">
            <div class="device-login-code" :aria-label="t('settings.deviceLoginCodeLabel')">
              {{ loginInfo.userCode }}
            </div>
            <div class="device-login-actions">
              <v-btn
                color="primary"
                variant="tonal"
                prepend-icon="mdi-open-in-new"
                @click="openVerification"
              >
                {{ t('settings.deviceLoginOpenBrowser') }}
              </v-btn>
              <v-btn
                variant="text"
                prepend-icon="mdi-content-copy"
                @click="copyCode"
              >
                {{ t('settings.deviceLoginCopyCode') }}
              </v-btn>
            </div>
            <div class="device-login-status">
              <v-progress-circular indeterminate size="18" width="2" color="primary"/>
              <span>{{ t('settings.deviceLoginWaiting') }}</span>
            </div>
          </template>

          <template v-else>
            <p class="device-login-result">
              {{ loginStage === 'denied'
                ? t('settings.deviceLoginDenied')
                : loginStage === 'expired'
                  ? t('settings.deviceLoginExpired')
                  : loginError }}
            </p>
            <v-btn color="primary" variant="tonal" @click="startLogin">
              {{ t('settings.deviceLoginRestart') }}
            </v-btn>
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn variant="text" @click="closeDialog">{{ t('common.cancel') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.online-account-header h2 {
  display: flex;
  align-items: center;
}
.online-account-header .mx-beta-badge {
  color: rgb(var(--v-theme-warning));
  font-size: 8px;
  line-height: 1;
}
.settings-rows { border-top: 1px solid var(--app-border); }
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 60px;
  gap: 20px;
  padding: 10px 18px;
}
.setting-row > span { display: flex; flex-direction: column; min-width: 0; gap: 3px; }
.setting-row strong {
  overflow: hidden;
  font-size: 11px;
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.setting-row small { color: rgba(var(--v-theme-on-surface), 0.46); font-size: 9px; line-height: 1.4; }
.device-login-intro {
  margin: 0 0 14px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 11px;
  line-height: 1.6;
}
.device-login-code {
  margin-bottom: 12px;
  padding: 12px 0;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-layer-muted);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 22px;
  font-weight: 640;
  letter-spacing: 0.14em;
  text-align: center;
  user-select: text;
}
.device-login-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.device-login-status {
  display: flex;
  align-items: center;
  gap: 9px;
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 11px;
}
.device-login-result {
  margin: 0 0 12px;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
</style>
