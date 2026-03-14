<script setup lang="ts">
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from 'vue-i18n';
import { useToast } from 'vue-toastification';
import { useRdpStore } from '@/stores/rdp.ts';

const { t } = useI18n();
const toast = useToast();
const store = useRdpStore();
const newPort = ref(3389);
const saving = ref(false);
const showDialog = ref(false);

function openDialog() {
  newPort.value = store.rdpPort;
  showDialog.value = true;
}

async function savePort() {
  if (newPort.value < 1 || newPort.value > 65535) {
    toast.error(t('rdp.port.invalidPort'));
    return;
  }
  saving.value = true;
  try {
    await invoke('set_rdp_port', { port: newPort.value });
    store.rdpPort = newPort.value;
    toast.success(t('rdp.port.saveSuccess'));
    showDialog.value = false;
  } catch (e: any) {
    toast.error(String(e));
  }
  saving.value = false;
}
</script>

<template>
  <v-card variant="flat" class="mb-4">
    <v-card-title>{{ t('rdp.port.title') }}</v-card-title>
    <v-card-subtitle>{{ t('rdp.port.subtitle') }}</v-card-subtitle>
    <v-card-text>
      <v-chip variant="outlined" prepend-icon="mdi-lan-connect" size="large">
        {{ t('rdp.port.current') }}: {{ store.rdpPort }}
      </v-chip>
    </v-card-text>
    <v-card-actions>
      <v-btn variant="tonal" rounded="lg" prepend-icon="mdi-pencil" @click="openDialog">
        {{ t('rdp.port.modify') }}
      </v-btn>
    </v-card-actions>

    <v-dialog v-model="showDialog" max-width="380">
      <v-card :title="t('rdp.port.modifyTitle')">
        <v-card-text>
          <v-text-field
            v-model.number="newPort"
            :label="t('rdp.port.label')"
            variant="outlined"
            density="compact"
            type="number"
            :min="1"
            :max="65535"
            hint="1 - 65535"
            persistent-hint
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showDialog = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="saving" @click="savePort">{{ t('common.confirm') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>
