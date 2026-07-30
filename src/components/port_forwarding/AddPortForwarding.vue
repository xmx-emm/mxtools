<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {computed, ref} from 'vue';
import type {Ipv, PortForwarding} from '@/types/network.ts';
import {isValidIPv4Regex} from '@/utils/regex.ts';
import {usePortForwardingStore} from '@/stores/port_forwarding.ts';
import {useStateStore} from '@/stores/state.ts';
import {useToast} from 'vue-toastification';
import {createMultiplePortForwarding} from '@/ipc/commands.ts';

const {t} = useI18n();
const toast = useToast();
const appState = useStateStore();
const isCreateDialog = ref(false);
const isCreating = ref(false);

const createList = ref<PortForwarding[]>([]);

const state = usePortForwardingStore();

function clonePortForwarding(item: PortForwarding): PortForwarding {
  return structuredClone(item);
}

const processedList = computed(() => {
  return createList.value.map((i) => {
    const ipvA: Ipv = {
      address: i.listen.address,
      port: Number(i.listen.port),
    };
    const ipvB: Ipv = {
      address: i.connect.address,
      port: Number(i.connect.port),
    };
    return {listen: ipvA, connect: ipvB} as PortForwarding;
  });
});

const createCount = computed(() => {
  const res: {[key: string]: number} = {};
  createList.value.forEach((i) => {
    const k = JSON.stringify(i);
    res[k] = (res[k] ?? 0) + 1;
  });
  return res;
});

const hasValidationError = computed(() => {
  if (createList.value.length === 0) return true;
  return createList.value.some(
    (item) =>
      !isValidIPv4Regex(item.listen.address) ||
      !isValidIPv4Regex(item.connect.address) ||
      checkIsAddedPortForwarding(item) ||
      checkIsSamePortForwarding(item),
  );
});

async function create() {
  const items = processedList.value;
  if (items.length === 0) return;
  state.list = await createMultiplePortForwarding({list: items});
}

function initCreate(add = false) {
  if (createList.value?.length === 0 || add) {
    if (add && createList.value?.length) {
      const last = clonePortForwarding(createList.value[createList.value.length - 1]);
      last.listen.port += 1;
      last.connect.port += 1;
      createList.value.push(last);
      return;
    }
    if (state.list?.length !== 0) {
      const sortList = [...state.list].sort((a, b) => a.listen.port - b.listen.port);
      const last = clonePortForwarding(sortList[sortList.length - 1]);
      last.listen.port += 1;
      last.connect.port += 1;
      createList.value.push(last);
      return;
    }
    createList.value.push(state.default());
  }
}

async function onSubmit() {
  if (hasValidationError.value) return;
  state.loading = true;
  isCreating.value = true;
  try {
    await create();
    createList.value = [];
    isCreateDialog.value = false;
  } catch (e) {
    toast.error(String(e));
  } finally {
    state.loading = false;
    isCreating.value = false;
  }
}

function checkIsAddedPortForwarding(item: PortForwarding): boolean {
  return state.list.some((i) => JSON.stringify(i) === JSON.stringify(item));
}

function checkIsSamePortForwarding(item: PortForwarding): boolean {
  const key = JSON.stringify(item);
  return (createCount.value[key] ?? 0) !== 1;
}
</script>

<template>
  <v-dialog
    v-model="isCreateDialog"
    width="auto"
    min-height="300"
    min-width="600"
    scrollable
    persistent
    transition="slide-y-transition"
  >
    <template v-slot:activator="{props: activatorProps}">
      <v-btn
        prepend-icon="mdi-plus"
        v-bind="activatorProps"
        :disabled="!appState.is_elevated"
        @click="initCreate(false)"
      >
        {{ t('portForwarding.add') }}
      </v-btn>
    </template>
    <v-card prepend-icon="mdi-plus">
      <template v-slot:prepend>
        <v-icon color="success"></v-icon>
      </template>
      <template v-slot:title>
        {{ t('portForwarding.addTitle') }}
      </template>

      <v-row no-gutters style="padding: 5px 12px;z-index: 5;align-content: center;text-align: center">
        <div style="flex: 3;padding: 5px 16px;">
          {{ t('portForwarding.listenAddress') }}
        </div>
        <div style="flex: 1;padding: 5px 16px;">
          {{ t('portForwarding.listenPort') }}
        </div>
        <v-spacer style="align-content: center; text-align: center;flex: 1">
          <v-icon icon="mdi-arrow-right-thin"/>
        </v-spacer>
        <div style="flex: 3;padding: 5px 16px;">
          {{ t('portForwarding.connectAddress') }}
        </div>
        <div style="flex: 1;padding: 5px 16px;">
          {{ t('portForwarding.connectPort') }}
        </div>
      </v-row>
      <v-card-text style="padding: 8px">
        <v-col>
          <div v-for="(item,index) in createList" :key="index">
            <v-row no-gutters color="red" class="justify-space-evenly" style="padding: 0">
              <v-text-field
                :readonly="state.loading"
                :loading="state.loading || !isValidIPv4Regex(item.listen.address) || checkIsAddedPortForwarding(item)"
                :error="!isValidIPv4Regex(item.listen.address) || checkIsAddedPortForwarding(item)"
                style="flex: 2"
                placeholder="127.0.0.1"
                variant="solo"
                hide-details="auto"
                v-model="item.listen.address"/>

              <v-text-field
                :readonly="state.loading"
                :loading="state.loading"
                style="flex: 1"
                placeholder="114"
                variant="solo"
                max-width="120"
                hide-details="auto"
                type="number"
                v-model.number="item.listen.port"/>
              <v-spacer style="align-content: center; text-align: center;flex: 1;">
                <v-hover>
                  <template v-slot:default="{isHovering, props}">
                    <v-icon
                      :icon="isHovering ? 'mdi-close' :'mdi-arrow-right-thin'"
                      :color="isHovering ? 'red' :'grey'"
                      variant="plain" v-bind="props" size="small"
                      @click="createList = createList.filter((_,i)=> i !== index)"
                    ></v-icon>
                  </template>
                </v-hover>
              </v-spacer>
              <v-text-field
                placeholder="127.0.0.1"
                variant="solo"
                hide-details="auto"
                :readonly="state.loading"
                :loading="state.loading || !isValidIPv4Regex(item.connect.address) || checkIsAddedPortForwarding(item)"
                :error="!isValidIPv4Regex(item.connect.address) || checkIsAddedPortForwarding(item)"
                style="flex: 2"
                v-model="item.connect.address"/>
              <v-text-field
                :readonly="state.loading"
                :loading="state.loading"
                style="flex: 1"
                type="number"
                placeholder="514" variant="solo" hide-details="auto"
                v-model.number="item.connect.port"/>
            </v-row>
            <v-col class="text-caption" style="padding: 0; color:orange;">
              <div v-if="!isValidIPv4Regex(item.listen.address)">
                {{ item.listen.address }} {{ t('portForwarding.addressError') }}
              </div>
              <div v-if="!isValidIPv4Regex(item.connect.address)">
                {{ item.connect.address }} {{ t('portForwarding.addressError') }}
              </div>
              <div v-if="checkIsAddedPortForwarding(item)">
                {{ t('portForwarding.alreadyAdded') }}
              </div>
              <div v-if="checkIsSamePortForwarding(item)">
                {{ t('portForwarding.duplicateInList') }}
              </div>
            </v-col>
            <v-spacer style="height: 5px"/>
          </div>
        </v-col>
      </v-card-text>
      <template v-slot:actions>
        <v-btn variant="text" :disabled="isCreating" @click="initCreate(true)">
          {{ t('portForwarding.add') }}
        </v-btn>
        <v-spacer></v-spacer>
        <v-btn variant="text" :disabled="isCreating" @click="isCreateDialog = false">
          {{ t('common.cancel') }}
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="hasValidationError"
          :loading="isCreating"
          @click="onSubmit"
        >
          {{ t('common.confirm') }}
        </v-btn>
      </template>
    </v-card>
  </v-dialog>
</template>

<style scoped>
</style>
