<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import EditPortForwarding from '@/components/port_forwarding/EditPortForwarding.vue';
import type {PortForwarding} from '@/types/network.ts';
import {computed} from 'vue';
import {useToast} from 'vue-toastification';
import {usePortForwardingStore} from '@/stores/port_forwarding.ts';
import {useStateStore} from '@/stores/state.ts';
import {delPortForwarding} from '@/ipc/commands.ts';

const {t} = useI18n();
const state = usePortForwardingStore();
const appState = useStateStore();

const tableData = computed(() => {
  return state.list.map((item) => ({
    listenAddress: item.listen.address,
    listenPort: item.listen.port,
    connectAddress: item.connect.address,
    connectPort: item.connect.port,
    origin: item,
  }));
});
const headers = computed(() => [
  {title: t('portForwarding.listenAddress'), key: 'listenAddress', align: 'start' as const},
  {title: t('portForwarding.listenPort'), key: 'listenPort'},
  {title: t('portForwarding.connectAddress'), key: 'connectAddress'},
  {title: t('portForwarding.connectPort'), key: 'connectPort'},
  {title: t('common.actions'), key: 'actions', align: 'end' as const, sortable: false},
]);

const toast = useToast();

async function del(item: PortForwarding) {
  if (!appState.is_elevated) return;
  state.loading = true;
  try {
    state.list = await delPortForwarding({item});
  } catch (e) {
    toast.error(String(e) || 'toast.deleteFailed');
  } finally {
    state.loading = false;
  }
}
</script>

<template>
  <v-data-table-virtual
    :items="tableData"
    :loading="state.loading"
    :headers="headers"
    fixed-header
    hide-default-footer
    density="compact"
  >
    <template v-slot:item.actions="{item}">
      <div class="d-flex justify-end">
        <EditPortForwarding :item="item.origin"/>
        <v-tooltip :text="t('portForwarding.removeConfirm')" location="left">
          <template v-slot:activator="{isActive, props}">
            <v-icon
              icon="mdi-delete"
              v-bind="props"
              :color="isActive ? 'red' :'per'"
              size="small"
              :disabled="!appState.is_elevated"
              @click="del(item.origin)"
            />
          </template>
        </v-tooltip>
      </div>
    </template>
  </v-data-table-virtual>
</template>

<style scoped>

</style>
