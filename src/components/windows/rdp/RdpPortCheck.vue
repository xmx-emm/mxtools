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
  if (!ip.value.trim()) {
    toast.error(t('rdp.portCheck.enterIp'));
    return;
  }
  checking.value = true;
  result.value = null;
  try {
    result.value = await checkRemotePort({ip: ip.value.trim(), port: port.value});
  } catch (e: unknown) {
    toast.error(String(e));
  } finally {
    checking.value = false;
  }
}
</script>

<template>
  <v-card variant="flat" class="rdp-card">
    <v-card-title class="text-subtitle-1 font-weight-medium pb-1">
      {{ t('rdp.portCheck.title') }}
    </v-card-title>
    <v-card-subtitle class="text-caption">
      {{ t('rdp.portCheck.subtitle') }}
    </v-card-subtitle>
    <v-card-text>
      <div class="port-check-form">
        <v-text-field
          v-model="ip"
          class="mx-standard-field"
          :label="t('rdp.portCheck.ipLabel')"
          variant="outlined"
          density="default"
          placeholder="192.168.1.100"
          hide-details
          autocomplete="off"
        />
        <v-text-field
          v-model.number="port"
          class="mx-standard-field"
          :label="t('rdp.port.label')"
          variant="outlined"
          density="default"
          type="number"
          :min="1"
          :max="65535"
          hide-details
        />
        <v-btn class="port-check-button" :loading="checking" variant="tonal" color="primary" @click="checkPort">
          {{ t('rdp.portCheck.check') }}
        </v-btn>
      </div>
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

<style scoped>
.port-check-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 104px;
  gap: 10px;
}

.port-check-button {
  grid-column: 1 / -1;
  min-height: var(--app-control-height-field) !important;
  height: var(--app-control-height-field) !important;
}

@media (max-width: 380px) {
  .port-check-form {
    grid-template-columns: 1fr;
  }
}
</style>
