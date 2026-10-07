<script setup lang="ts">
import {computed} from 'vue';
import {convertFileSrc} from '@tauri-apps/api/core';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import EAIcon from '@/components/icons/EAIcon.vue';
import {useApexStore} from '@/stores/game/apex.ts';
import type {ApexLauncherAccount} from '@/types/apex.ts';
import {steamAvatarUrl} from '@/utils/game/steam.ts';
import {confirm} from '@/utils/app_confirmation.ts';
import {formatApplyLaunchOptionError} from '@/composables/useCloseLauncherThenApply.ts';

const emits = defineEmits<{ (e: 'update_user'): void }>();
const { t } = useI18n();
const apex_store = useApexStore();
const toast = useToast();
let switching_account = false;

function accountKey(acc: ApexLauncherAccount): string {
  return `${acc.kind}:${acc.user.id}`;
}

const activeAvatarSrc = computed(() => {
  const acc = apex_store.active_apex_account;
  if (!acc) return undefined;
  if (acc.kind === 'steam') {
    return steamAvatarUrl(acc.user.avatar);
  }
  const a = acc.user.avatar?.trim() ?? '';
  if (!a) return undefined;
  if (/^https?:\/\//i.test(a)) return a;
  try {
    return convertFileSrc(a);
  } catch {
    return undefined;
  }
});

const accountDetailTitle = computed(() => {
  const acc = apex_store.active_apex_account;
  if (!acc) return undefined;
  if (acc.kind === 'steam') return `id: ${acc.user.id}`;
  if (acc.kind === 'ea') return `userid: ${acc.user.user_userid}`;
  return undefined;
});

function listItemAvatarSrc(acc: ApexLauncherAccount): string | undefined {
  if (acc.kind === 'steam') {
    return steamAvatarUrl(acc.user.avatar);
  }
  const a = acc.user.avatar?.trim() ?? '';
  if (!a) return undefined;
  if (/^https?:\/\//i.test(a)) return a;
  try {
    return convertFileSrc(a);
  } catch {
    return undefined;
  }
}

/** 切换前处理当前账户未保存的启动项；返回 false 表示留在当前账户 */
async function resolveUnsavedLaunchOptions(): Promise<boolean> {
  if (!apex_store.is_launch_options_modified) return true;
  let discard = false;
  const save = await confirm(t('apex.unsavedLaunchSwitchMessage'), {
    title: t('apex.unsavedLaunchSwitchTitle'),
    kind: 'warning',
    confirmText: t('apex.saveAndSwitchAccount'),
    actionText: t('apex.discardAndSwitchAccount'),
    onAction: () => {
      discard = true;
    },
  });
  if (discard) return true;
  if (!save) return false;
  if (!await apex_store.check_miles_language()) {
    toast.error('toast.milesLanguageNotFound');
    return false;
  }
  try {
    // 后端写入前会校验启动器已退出，失败时留在当前账户
    await apex_store.persist_launch_options();
    toast.success('toast.applyLaunchOptionSuccess');
    return true;
  } catch (err) {
    console.warn('save launch options before account switch failed', err);
    toast.error(formatApplyLaunchOptionError(err), {timeout: 8000});
    return false;
  }
}

async function selectAccount(acc: ApexLauncherAccount) {
  if (switching_account || accountKey(acc) === apex_store.launcher_selection_key) return;
  switching_account = true;
  try {
    if (!await resolveUnsavedLaunchOptions()) return;
    apex_store.set_active_apex_account(acc);
    emits('update_user');
  } finally {
    switching_account = false;
  }
}
</script>

<template>
  <v-menu class="not_select">
    <v-list>
      <template v-if="apex_store.apex_accounts.length > 0">
        <v-list-item
          v-for="acc in apex_store.apex_accounts"
          :key="accountKey(acc)"
          @click="selectAccount(acc)"
        >
        <template v-slot:prepend>
          <v-avatar :title="acc.user.config_path">
            <v-img
              v-if="listItemAvatarSrc(acc)"
              :src="listItemAvatarSrc(acc)"
              cover
              alt=""
            />
            <v-icon
              v-else-if="acc.kind === 'steam'"
              icon="mdi-steam"
            />
            <EAIcon v-else-if="acc.kind === 'ea'" :size="64" />
            <v-icon v-else icon="mdi-account" />
          </v-avatar>
        </template>
        <v-list-item-title class="d-flex align-center flex-wrap ga-1">
          <span>{{ acc.user.name }}</span>
          <v-icon
            v-if="acc.kind === 'steam'"
            icon="mdi-steam"
            size="small"
            color="primary"
          />
          <EAIcon v-else :size="14" />
        </v-list-item-title>
        <v-list-item-subtitle>{{ acc.user.id }}</v-list-item-subtitle>
        </v-list-item>
      </template>
      <v-list-item v-else>
        {{ t('apex.noAccountsFound') }}
      </v-list-item>
    </v-list>
    <template v-slot:activator="{ props }">
      <div class="d-flex align-end justify-start launcher-user-trigger">
        <v-btn
          icon
          v-bind="props"
          :title="apex_store.active_apex_account?.user.name ?? t('apex.noLauncherAccount')"
          :aria-label="apex_store.active_apex_account?.user.name ?? t('apex.noLauncherAccount')"
        >
          <v-avatar size="large">
            <v-img
              v-if="activeAvatarSrc"
              :src="activeAvatarSrc"
              cover
              alt=""
            />
            <v-icon
              v-else-if="apex_store.active_apex_account?.kind === 'steam'"
              icon="mdi-steam"
            />
            <EAIcon
              v-else-if="apex_store.active_apex_account?.kind === 'ea'"
              :size="100"
            />
            <v-icon v-else icon="mdi-account" />
          </v-avatar>
        </v-btn>
        <div class="launcher-user-text">
          <span :title="accountDetailTitle" class="d-inline-flex align-center ga-1">
            <v-icon
              v-if="apex_store.active_apex_account?.kind === 'steam'"
              icon="mdi-steam"
              size="small"
              color="primary"
            />
            <EAIcon
              v-else-if="apex_store.active_apex_account?.kind === 'ea'"
              :size="16"
            />
            <v-icon
              v-else
              icon="mdi-account-question"
              size="small"
              color="medium-emphasis"
            />
          </span>
          <div
            v-bind="props"
            class="launcher-user-name text-body-2"
            :class="{'launcher-user-name--empty': !apex_store.active_apex_account}"
          >
            {{ apex_store.active_apex_account?.user.name ?? t('apex.noLauncherAccount') }}
          </div>
        </div>
      </div>
    </template>
  </v-menu>
</template>

<style scoped>
.launcher-user-trigger {
  min-width: 0;
  max-width: 100%;
}

.launcher-user-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  margin-inline-start: 8px;
  min-width: 0;
  flex: 1 1 auto;
}

.launcher-user-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.launcher-user-name--empty {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.75rem !important;
}
</style>
