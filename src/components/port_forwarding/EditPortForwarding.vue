<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {ref} from 'vue';
import type {PortForwarding} from '@/types/network.ts';
import {isValidIPv4Regex} from '@/utils/regex.ts';
import {usePortForwardingStore} from '@/stores/port_forwarding.ts';
import {useStateStore} from '@/stores/state.ts';
import {useToast} from 'vue-toastification';
import {setPortForwarding} from '@/ipc/commands.ts';

const {t} = useI18n();
const toast = useToast();
const props = defineProps<{item: PortForwarding}>();

const state = usePortForwardingStore();
const appState = useStateStore();

const isEditDialog = ref(false);
const formEdit = ref(state.default());

async function edit(item: PortForwarding) {
  if (!appState.is_elevated) return;
  const found = state.list.find((i) => JSON.stringify(item) === JSON.stringify(i));
  if (!found) return;
  formEdit.value = structuredClone(found);
  isEditDialog.value = true;
}

async function save() {
  state.loading = true;
  try {
    state.list = await setPortForwarding({item: formEdit.value});
    isEditDialog.value = false;
  } catch (e) {
    toast.error(String(e));
  } finally {
    state.loading = false;
  }
}
</script>
<template>
  <v-dialog
    v-model="isEditDialog"
    width="auto"
    min-height="300"
    min-width="600"
    scrollable
    persistent
    transition="slide-y-transition"
  >
    <template v-slot:activator="{props: activatorProps}">
      <v-icon
        v-bind="activatorProps"
        icon="mdi-pencil"
        size="small"
        :disabled="!appState.is_elevated"
        @click="edit(props.item)"
      />
    </template>
    <v-card>
      <template v-slot:title>
        {{ t('portForwarding.editTitle') }}
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
          <v-row no-gutters color="red" class="justify-space-evenly" style="padding: 0">
            <v-text-field
              :readonly="state.loading"
              :loading="state.loading || !isValidIPv4Regex(formEdit.listen.address)"
              :error="!isValidIPv4Regex(formEdit.listen.address)"
              style="flex: 2"
              placeholder="127.0.0.1"
              variant="solo"
              hide-details="auto"
              v-model="formEdit.listen.address"/>

            <v-text-field
              :readonly="state.loading"
              :loading="state.loading"
              style="flex: 1"
              placeholder="114"
              variant="solo"
              max-width="120"
              hide-details="auto"
              type="number"
              v-model.number="formEdit.listen.port"/>
            <v-text-field
              placeholder="127.0.0.1"
              variant="solo"
              hide-details="auto"
              :readonly="state.loading"
              :loading="state.loading || !isValidIPv4Regex(formEdit.connect.address)"
              :error="!isValidIPv4Regex(formEdit.connect.address)"
              style="flex: 2"
              v-model="formEdit.connect.address"/>
            <v-text-field
              :readonly="state.loading"
              :loading="state.loading"
              style="flex: 1"
              type="number"
              placeholder="514" variant="solo" hide-details="auto"
              v-model.number="formEdit.connect.port"/>
          </v-row>
          <v-col class="text-caption" style="padding: 0; color:orange;">
            <div v-if="!isValidIPv4Regex(formEdit.listen.address)">
              {{ formEdit.listen.address }} {{ t('portForwarding.addressError') }}
            </div>
            <div v-if="!isValidIPv4Regex(formEdit.connect.address)">
              {{ formEdit.connect.address }} {{ t('portForwarding.addressError') }}
            </div>
          </v-col>
          <v-spacer style="height: 5px"/>
        </v-col>
      </v-card-text>
      <v-card-actions>
        <v-btn variant="plain" @click="isEditDialog = false">{{ t('common.cancel') }}</v-btn>
        <v-spacer></v-spacer>
        <v-btn @click="save">{{ t('common.save') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
<style scoped>
</style>
