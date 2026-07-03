<script setup lang="ts">
import {computed} from 'vue';
import {convertFileSrc} from '@tauri-apps/api/core';
import {useI18n} from 'vue-i18n';
import EAIcon from '@/components/icons/EAIcon.vue';
import apexStore from '@/stores/game/apex.ts';
import type {ApexLauncherAccount} from '@/types/apex.ts';
import {steamAvatarUrl} from '@/utils/game/steam.ts';

const emits = defineEmits<{ (e: 'update_user'): void }>();
const { t } = useI18n();
const apex_store = apexStore();

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

function selectAccount(acc: ApexLauncherAccount) {
  apex_store.set_active_apex_account(acc);
  emits('update_user');
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
          :title="apex_store.active_apex_account?.user.name"
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
          <div v-bind="props" class="launcher-user-name text-body-2">
            {{ apex_store.active_apex_account?.user.name ?? '—' }}
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
</style>
