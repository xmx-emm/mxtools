<script setup lang="ts">
import {onMounted, ref} from 'vue';
import {invoke} from '@tauri-apps/api/core';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {useRdpStore} from '@/stores/rdp.ts';

const { t } = useI18n();
const toast = useToast();
const store = useRdpStore();
const switching = ref(false);

async function toggleRdp() {
  switching.value = true;
  try {
    const newState = !store.rdpEnabled;
    await invoke('set_rdp_enabled', { enabled: newState });
    store.rdpEnabled = newState;
    toast.success(newState ? t('rdp.status.enabled') : t('rdp.status.disabled'));
  } catch (e: any) {
    toast.error(String(e));
  }
  switching.value = false;
}

onMounted(async () => {
  await store.loadRdpStatus();
  await store.loadRdpPort();
});
</script>

<template>
  <v-card variant="flat" class="mb-4">
    <v-card-title>{{ t('rdp.status.title') }}</v-card-title>
    <v-card-subtitle>{{ t('rdp.status.subtitle') }}</v-card-subtitle>
    <v-card-text>
      <div class="d-flex align-center ga-4">
        <v-chip
          :color="store.rdpEnabled ? 'success' : 'error'"
          variant="tonal"
          :prepend-icon="store.rdpEnabled ? 'mdi-check-circle' : 'mdi-close-circle'"
        >
          {{ store.rdpEnabled ? t('rdp.status.on') : t('rdp.status.off') }}
        </v-chip>
        <v-chip variant="outlined" prepend-icon="mdi-lan-connect">
          {{ t('rdp.port.label') }}: {{ store.rdpPort }}
        </v-chip>
      </div>
    </v-card-text>
    <v-card-actions>
      <v-btn
        :loading="switching"
        :color="store.rdpEnabled ? 'error' : 'success'"
        variant="tonal"
        rounded="lg"
        @click="toggleRdp"
        :prepend-icon="store.rdpEnabled ? 'mdi-close' : 'mdi-check'"
      >
        {{ store.rdpEnabled ? t('rdp.status.turnOff') : t('rdp.status.turnOn') }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>
