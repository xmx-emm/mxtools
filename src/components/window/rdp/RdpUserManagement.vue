<script setup lang="ts">
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from 'vue-i18n';
import { useToast } from 'vue-toastification';
import { useWindowsUserStore } from '@/stores/windows_user.ts';

const { t } = useI18n();
const toast = useToast();
const store = useWindowsUserStore();
const actionLoading = ref<string[]>([]);

async function toggleRdpUser(username: string, isCurrentlyRdp: boolean) {
  actionLoading.value.push(username);
  try {
    if (isCurrentlyRdp) {
      await invoke('remove_rdp_user', { username });
      toast.success(`${username} ${t('rdp.rdpUser.removed')}`);
    } else {
      await invoke('add_rdp_user', { username });
      toast.success(`${username} ${t('rdp.rdpUser.added')}`);
    }
    await store.loadUsers();
  } catch (e: any) {
    toast.error(String(e));
  }
  actionLoading.value = actionLoading.value.filter((n) => n !== username);
}
</script>

<template>
  <v-card variant="flat" class="mb-4">
    <v-card-title>{{ t('rdp.rdpUser.title') }}</v-card-title>
    <v-card-subtitle>{{ t('rdp.rdpUser.subtitle') }}</v-card-subtitle>
    <v-card-text>
      <div class="d-flex flex-wrap ga-2">
        <v-chip
          v-for="user in store.users"
          :key="user.name"
          :color="user.is_rdp_user ? 'primary' : 'default'"
          :variant="user.is_rdp_user ? 'flat' : 'outlined'"
          :prepend-icon="user.is_rdp_user ? 'mdi-account-check' : 'mdi-account-outline'"
          :loading="actionLoading.includes(user.name)"
          @click="toggleRdpUser(user.name, user.is_rdp_user)"
        >
          {{ user.name }}
        </v-chip>
      </div>
    </v-card-text>
    <v-card-actions>
      <v-btn variant="tonal" rounded="lg" prepend-icon="mdi-refresh" @click="store.loadUsers()">
        {{ t('common.refresh') }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>
