<script setup lang="ts">
import {ref} from 'vue';
import {invoke} from '@tauri-apps/api/core';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';

const { t } = useI18n();
const toast = useToast();

const ip = ref('');
const port = ref(3389);
const checking = ref(false);
const result = ref<null | boolean>(null);

async function checkPort() {
  if (!ip.value) {
    toast.error(t('rdp.portCheck.enterIp'));
    return;
  }
  checking.value = true;
  result.value = null;
  try {
    result.value = await invoke('check_remote_port', { ip: ip.value, port: port.value });
  } catch (e: any) {
    toast.error(String(e));
  }
  checking.value = false;
}
</script>

<template>
  <v-card variant="flat" class="mb-4">
    <v-card-title>{{ t('rdp.portCheck.title') }}</v-card-title>
    <v-card-subtitle>{{ t('rdp.portCheck.subtitle') }}</v-card-subtitle>
    <v-card-text>
      <v-row dense>
        <v-col cols="7">
          <v-text-field
            v-model="ip"
            :label="t('rdp.portCheck.ipLabel')"
            variant="outlined"
            density="compact"
            placeholder="192.168.1.100"
            hide-details
          />
        </v-col>
        <v-col cols="3">
          <v-text-field
            v-model.number="port"
            :label="t('rdp.port.label')"
            variant="outlined"
            density="compact"
            type="number"
            hide-details
          />
        </v-col>
        <v-col cols="2" class="d-flex align-center">
          <v-btn
            :loading="checking"
            variant="tonal"
            color="primary"
            block
            @click="checkPort"
          >
            {{ t('rdp.portCheck.check') }}
          </v-btn>
        </v-col>
      </v-row>
      <div v-if="result !== null" class="mt-3">
        <v-alert
          :type="result ? 'success' : 'error'"
          variant="tonal"
          density="compact"
        >
          {{ result ? t('rdp.portCheck.open') : t('rdp.portCheck.closed') }}
          — {{ ip }}:{{ port }}
        </v-alert>
      </div>
    </v-card-text>
  </v-card>
</template>
