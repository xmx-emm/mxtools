<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {ref} from 'vue';
import {usePortForwardingStore} from '@/stores/port_forwarding.ts';
import {useStateStore} from '@/stores/state.ts';
import {useToast} from 'vue-toastification';
import {resetPortForwarding} from '@/ipc/commands.ts';

const {t} = useI18n();
const toast = useToast();
const appState = useStateStore();
const isClearDialog = ref(false);
const portForwardingStore = usePortForwardingStore();

async function reset() {
  portForwardingStore.loading = true;
  try {
    portForwardingStore.list = await resetPortForwarding();
    isClearDialog.value = false;
  } catch (e) {
    toast.error(String(e));
  } finally {
    portForwardingStore.loading = false;
  }
}
</script>

<template>
  <v-dialog v-model="isClearDialog" max-width="420" persistent>
    <template v-slot:activator="{props: activatorProps}">
      <v-tooltip :text="t('portForwarding.removeAllConfirm')" location="bottom">
        <template v-slot:activator="{isActive, props}">
          <v-btn
            prepend-icon="mdi-close"
            :color="isActive ? 'red' :'per'"
            v-bind="{...props, ...activatorProps}"
            :disabled="!appState.is_elevated || portForwardingStore.list?.length == 0"
          >
            {{ t('portForwarding.removeAll') }}
          </v-btn>
        </template>
      </v-tooltip>
    </template>
    <v-card>
      <v-card-title>{{ t('portForwarding.removeAll') }}</v-card-title>
      <v-card-text>{{ t('portForwarding.removeAllConfirm') }}</v-card-text>
      <v-card-actions>
        <v-spacer/>
        <v-btn variant="plain" @click="isClearDialog = false">{{ t('common.cancel') }}</v-btn>
        <v-btn color="error" :loading="portForwardingStore.loading" @click="reset">
          {{ t('common.confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>

</style>
