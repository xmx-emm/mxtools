<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {openPath} from '@tauri-apps/plugin-opener';
import {sleep} from '@/utils/time.ts';
import {ref} from 'vue';
import {useToast} from 'vue-toastification';
import apexStore from '@/stores/game/apex.ts';

const { t } = useI18n();
const is_launching = ref(false);
const toast = useToast();
const apex_store = apexStore();

async function start_apex() {
  is_launching.value = true;
  await openPath(apex_store.open_apex_url);
  toast.info('apex.startApex');
  await sleep(2000);
  is_launching.value = false;
}
</script>

<template>
  <v-btn @click="start_apex" :loading="is_launching" :title="`${t('apex.startApex')} ${apex_store.open_apex_url}`">
    {{ t('apex.startApex') }}
  </v-btn>
</template>

<style scoped>
</style>
