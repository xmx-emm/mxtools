<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { computed, ref } from 'vue';
import type { Ipv, PortForwarding } from '@/type.ts';
import { invoke } from '@tauri-apps/api/core';
import { cloneDeep } from 'lodash';
import { isValidIPv4Regex } from '@/utils/regex.ts';
import { usePortForwardingStore } from '@/stores/port_forwarding.ts';

const { t } = useI18n();
const isCreateDialog = ref(false);
const isCreating = ref(false);

const createList = ref<PortForwarding[]>([]);

const state = usePortForwardingStore();

const processedList = computed(() => {
  //处理数据,将port转换为string
  return createList.value.map((i) => {
    const ipvA: Ipv = {
      address: i.listen.address,
      port: Number(i.listen.port),
    };
    const ipvB: Ipv = {
      address: i.connect.address,
      port: Number(i.connect.port),
    };
    const item: PortForwarding = {
      listen: ipvA,
      connect: ipvB,
    };
    return item;
  });
});

const createCount = computed(() => {
  const res: { [key: string]: number } = {};
  createList.value.forEach((i) => {
    const k = String(JSON.stringify(i));
    if (k in res) {
      res[k] += 1;
    } else {
      res[k] = 1;
    }
  });
  return res;
});

async function create() {
  const items = processedList.value;
  if (items.length !== 0) {
    state.list = await invoke('create_multiple_port_forwarding', { list: items });
  }
}

function initCreate(add = false) {
  if (createList.value?.length === 0 || add) {
    if (add && createList.value?.length) {//添加一个新的
      let last = cloneDeep(createList.value[createList.value.length - 1]);
      last.listen.port += 1;
      last.connect.port += 1;
      createList.value.push(last);
      return;
    }
    if (state.list?.length !== 0) {
      let sortList = state.list.sort((a, b) => {
        return a.listen.port - b.listen.port;
      });
      let last = cloneDeep(sortList[sortList.length - 1]);
      last.listen.port += 1;
      last.connect.port += 1;
      createList.value.push(last);
      return;
    }
    createList.value.push(state.default());
  }
}

async function onSubmit() {
  state.loading = true;
  isCreating.value = true;
  await create();
  state.loading = false;
  createList.value = [];
  isCreateDialog.value = false;
  isCreating.value = false;
}

/**
 * 反回端口转发是否已被添加的布尔值
 */
function checkIsAddedPortForwarding(item: PortForwarding): boolean {
  const il = state.list.filter((i) => JSON.stringify(i) === JSON.stringify(item));
  return il.length !== 0;
}

/**
 * 反回创建列表是否有相同项的布尔值
 */
function checkIsSamePortForwarding(item: PortForwarding): boolean {
  const key = JSON.stringify(item);
  let count = createCount.value[key];
  return count !== 1;
}

</script>

<template>
  <v-dialog v-model="isCreateDialog" width="auto" minHeight="300" minWidth="600" scrollable persisten
            transition="slide-y-transition">
    <template v-slot:activator="{ props: activatorProps }">
      <v-btn prepend-icon="mdi-plus" v-bind="activatorProps" @click="initCreate(false)">
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

      <!--              列表头-->
      <v-row no-gutters style="padding: 5px 12px;z-index: 5;align-content: center;text-align: center">
        <div style="flex: 3;padding: 5px 16px;">
          Listen Address
        </div>
        <div style="flex: 1;padding: 5px 16px;">
          Port
        </div>
        <v-spacer style="align-content: center; text-align: center;flex: 1">
          <v-icon icon="mdi-arrow-right-thin"/>
        </v-spacer>
        <div style="flex: 3;padding: 5px 16px;">
          Connect Address
        </div>
        <div style="flex: 1;padding: 5px 16px;">
          Port
        </div>
      </v-row>
      <v-card-text style="padding: 8px">
        <!--              绘制添加列表-->
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
                  <template v-slot:default="{ isHovering, props }">
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
                {{ item.listen.address }} Address Error
              </div>
              <div v-if="!isValidIPv4Regex(item.connect.address)">
                {{ item.connect.address }} Address Error
              </div>
              <div v-if="checkIsAddedPortForwarding(item)">
                This port forwarding has been added
              </div>
              <div v-if="checkIsSamePortForwarding(item)">
                There are identical items present
              </div>
            </v-col>
            <v-spacer style="height: 5px"/>
          </div>
        </v-col>
      </v-card-text>
      <template v-slot:actions>
        <v-btn @click="initCreate(true)">
          Add
        </v-btn>
        <v-spacer></v-spacer>
        <v-btn @click="isCreateDialog = !isCreateDialog">
          Cancel
        </v-btn>
        <v-btn
          color="success"
          :disabled="createList.length===0"
          :loading="isCreating"
          @click="onSubmit"
        >
          Confirm
        </v-btn>
      </template>
    </v-card>
  </v-dialog>
</template>

<style scoped>
</style>
