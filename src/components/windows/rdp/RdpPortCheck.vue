<script setup lang="ts">
import {ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {useRdpStore} from '@/stores/rdp.ts';
import {checkRemotePort} from '@/ipc/commands.ts';

const { t } = useI18n();
const toast = useToast();
const store = useRdpStore();

const ip = ref('');
const port = ref(store.rdpPort);
const checking = ref(false);
const result = ref<null | boolean>(null);

watch(() => store.rdpPort, (p) => {
  port.value = p;
});

async function checkPort() {
  if (!ip.value) {
    toast.error(t('rdp.portCheck.enterIp'));
    return;
  }
  checking.value = true;
  result.value = null;
  try {
    result.value = await checkRemotePort({ ip: ip.value, port: port.value });
  } catch (e: unknown) {
    toast.error(String(e));
  }
  checking.value = false;
}
</script>

<template>
  <v-card variant="flat" class="rdp-card mb-4">
    <v-card-title class="text-subtitle-1 font-weight-medium pb-1">
      {{ t('rdp.portCheck.title') }}
    </v-card-title>
    <v-card-subtitle class="text-caption" style="opacity: 0.8;">
      {{ t('rdp.portCheck.subtitle') }}
    </v-card-subtitle>
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
            rounded="lg"
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
