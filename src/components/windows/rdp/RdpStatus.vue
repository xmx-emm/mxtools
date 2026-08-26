<script setup lang="ts">
import {ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {useRdpStore} from '@/stores/rdp.ts';
import {setRdpEnabled, setRdpPort} from '@/ipc/commands.ts';

const { t } = useI18n();
const toast = useToast();
const store = useRdpStore();
const switching = ref(false);
const newPort = ref(3389);
const saving = ref(false);
const showDialog = ref(false);

async function toggleRdp() {
  switching.value = true;
  try {
    const newState = !store.rdpEnabled;
    await setRdpEnabled({ enabled: newState });
    store.rdpEnabled = newState;
    toast.success(newState ? t('rdp.status.enabled') : t('rdp.status.disabled'));
  } catch (e: unknown) {
    toast.error(String(e));
  } finally {
    switching.value = false;
  }
}

function openDialog() {
  newPort.value = store.rdpPort;
  showDialog.value = true;
}

async function savePort() {
  if (!Number.isInteger(newPort.value) || newPort.value < 1 || newPort.value > 65535) {
    toast.error(t('rdp.port.invalidPort'));
    return;
  }
  saving.value = true;
  try {
    await setRdpPort({ port: newPort.value });
    store.rdpPort = newPort.value;
    toast.success(t('rdp.port.saveSuccess'));
    showDialog.value = false;
  } catch (e: unknown) {
    toast.error(String(e));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <v-card variant="flat" class="rdp-card">
    <v-card-title class="text-subtitle-1 font-weight-medium pb-1">
      {{ t('rdp.status.title') }}
    </v-card-title>
    <v-card-subtitle class="text-caption">
      {{ t('rdp.status.subtitle') }}
    </v-card-subtitle>
    <v-card-text>
      <div class="rdp-status-summary">
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
    <v-card-actions class="pt-0">
      <v-btn
        :loading="switching"
        :color="store.rdpEnabled ? 'error' : 'success'"
        variant="tonal"
        size="small"
        @click="toggleRdp"
        :prepend-icon="store.rdpEnabled ? 'mdi-close' : 'mdi-check'"
      >
        {{ store.rdpEnabled ? t('rdp.status.turnOff') : t('rdp.status.turnOn') }}
      </v-btn>
      <v-btn variant="tonal" size="small" prepend-icon="mdi-pencil" @click="openDialog">
        {{ t('rdp.port.modify') }}
      </v-btn>
    </v-card-actions>

    <v-dialog v-model="showDialog" max-width="380">
      <v-card :title="t('rdp.port.modifyTitle')">
        <v-card-text>
          <v-text-field
            v-model.number="newPort"
            class="mx-standard-field"
            :label="t('rdp.port.label')"
            variant="outlined"
            density="default"
            type="number"
            :min="1"
            :max="65535"
            hint="1 - 65535"
            persistent-hint
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer/>
          <v-btn @click="showDialog = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="saving" @click="savePort">{{ t('common.confirm') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<style scoped>
.rdp-status-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

@media (max-width: 380px) {
  .rdp-status-summary {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
