<script setup lang="ts">
import {ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {useWindowsUserStore} from '@/stores/windows_user.ts';
import {addRdpUser, removeRdpUser} from '@/ipc/commands.ts';

const { t } = useI18n();
const toast = useToast();
const store = useWindowsUserStore();
const actionLoading = ref<string[]>([]);

async function toggleRdpUser(username: string, isCurrentlyRdp: boolean) {
  if (actionLoading.value.includes(username)) return;
  actionLoading.value.push(username);
  try {
    if (isCurrentlyRdp) {
      await removeRdpUser({ username });
      toast.success(`${username} ${t('rdp.rdpUser.removed')}`);
    } else {
      await addRdpUser({ username });
      toast.success(`${username} ${t('rdp.rdpUser.added')}`);
    }
    await store.loadUsers();
  } catch (e: unknown) {
    toast.error(String(e));
  }
  actionLoading.value = actionLoading.value.filter((n) => n !== username);
}
</script>

<template>
  <v-card variant="flat" class="rdp-card mb-4">
    <v-card-title class="text-subtitle-1 font-weight-medium pb-1">
      {{ t('rdp.rdpUser.title') }}
    </v-card-title>
    <v-card-subtitle class="text-caption" style="opacity: 0.8;">
      {{ t('rdp.rdpUser.subtitle') }}
    </v-card-subtitle>
    <v-card-text>
      <div v-if="store.users.length > 0" class="d-flex flex-wrap ga-2">
        <v-chip
          v-for="user in store.users"
          :key="user.name"
          :color="user.is_rdp_user ? 'primary' : undefined"
          :variant="user.is_rdp_user ? 'flat' : 'outlined'"
          class="rdp-user-chip"
          @click="toggleRdpUser(user.name, user.is_rdp_user)"
        >
          <template v-slot:prepend>
            <v-progress-circular
              v-if="actionLoading.includes(user.name)"
              :size="18"
              indeterminate
              color="primary"
            />
            <v-icon
              v-else
              :icon="user.is_rdp_user ? 'mdi-account-check' : 'mdi-account-outline'"
              size="small"
            />
          </template>
          {{ user.name }}
        </v-chip>
      </div>
      <p v-else class="text-caption text-medium-emphasis mb-0">
        {{ t('rdp.rdpUser.empty') }}
      </p>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.rdp-user-chip {
  border-radius: 10px;
}
</style>
