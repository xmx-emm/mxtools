<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {ref} from 'vue';
import {invoke} from '@tauri-apps/api/core';
import {usePortForwardingStore} from '@/stores/port_forwarding.ts';

const { t } = useI18n();
const isClearDialog = ref(false);
const portForwardingStore = usePortForwardingStore();

async function reset() {
  portForwardingStore.loading = true;
  portForwardingStore.list = await invoke('reset_port_forwarding');
  portForwardingStore.loading = false;
  isClearDialog.value = false;
}

</script>

<template>
  <v-tooltip :text="t('portForwarding.removeAllConfirm')" location="bottom">
    <template v-slot:activator="{ isActive, props }">
      <v-btn prepend-icon="mdi-close"
             :color="isActive ? 'red' :'per'"
             v-bind="props" :disabled="portForwardingStore.list?.length==0" @click="reset">
        {{ t('portForwarding.removeAll') }}
      </v-btn>
    </template>
  </v-tooltip>
</template>

<style scoped>

</style>
