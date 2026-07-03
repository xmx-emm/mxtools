<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import EditPortForwarding from '@/components/port_forwrarding/EditPortForwarding.vue';
import type {PortForwarding} from '@/types/network.ts';
import {computed} from 'vue';
import {useToast} from 'vue-toastification';
import {invoke} from '@tauri-apps/api/core';
import {usePortForwardingStore} from '@/stores/port_forwarding.ts';

const { t } = useI18n();
const state = usePortForwardingStore();

const tableData = computed(() => {
  return state.list.map((item) => {
    return {
      'Listen Adders': item.listen.address,
      'Listen Port': item.listen.port,
      'Connect Adders': item.connect.address,
      'Connect Port': item.connect.port,
      'origin': item
    };
  });
});
const headers = computed(() => [
  { title: t('portForwarding.listenAddress'), key: 'Listen Adders', align: 'start' },
  { title: t('portForwarding.listenPort'), key: 'Listen Port' },
  { title: t('portForwarding.connectAddress'), key: 'Connect Adders' },
  { title: t('portForwarding.connectPort'), key: 'Connect Port' },
  { title: t('common.actions'), key: 'actions', align: 'end', sortable: false },
]);

const toast = useToast();


async function del(item: PortForwarding) {
  state.loading = true;
  const isDeled = await invoke('del_port_forwarding', { item: item });
  if (isDeled) {
    state.list = state.list.filter((i) => JSON.stringify(i) !== JSON.stringify(item));//通过filter删除元素
  } else {
    toast.error('toast.deleteFailed');
  }
  state.loading = false;
}

</script>

<template>
  <v-data-table-virtual :items="tableData"
                        :loading="state.loading"
                        :headers="headers as any"
                        fixed-header
                        hide-default-footer
                        density="compact"
  >
    <template v-slot:item.actions="{ item }">
      <div class="d-flex justify-end">
        <EditPortForwarding :item="item.origin"/>
        <v-tooltip :text="t('portForwarding.removeConfirm')" location="left">
          <template v-slot:activator="{ isActive, props }">
            <v-icon
              icon="mdi-delete"
              v-bind="props"
              :color="isActive ? 'red' :'per'"
              size="small"
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
