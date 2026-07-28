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
  }
  switching.value = false;
}

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
    await setRdpPort({ port: newPort.value });
    store.rdpPort = newPort.value;
    toast.success(t('rdp.port.saveSuccess'));
    showDialog.value = false;
  } catch (e: unknown) {
    toast.error(String(e));
  }
  saving.value = false;
}
</script>

<template>
  <v-card variant="flat" class="rdp-card mb-4">
    <v-card-title class="text-subtitle-1 font-weight-medium pb-1">
      {{ t('rdp.status.title') }}
    </v-card-title>
    <v-card-subtitle class="text-caption" style="opacity: 0.8;">
      {{ t('rdp.status.subtitle') }}
    </v-card-subtitle>
    <v-card-text>
      <div class="d-flex align-center flex-wrap ga-4">
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
        rounded="lg"
        @click="toggleRdp"
        :prepend-icon="store.rdpEnabled ? 'mdi-close' : 'mdi-check'"
      >
        {{ store.rdpEnabled ? t('rdp.status.turnOff') : t('rdp.status.turnOn') }}
      </v-btn>
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
          <v-spacer/>
          <v-btn @click="showDialog = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="primary" :loading="saving" @click="savePort">{{ t('common.confirm') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>
