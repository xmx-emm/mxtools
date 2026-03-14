<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { openPath } from '@tauri-apps/plugin-opener';
import { sleep } from '@/utils/time.ts';
import { ref } from 'vue';
import { useToast } from 'vue-toastification';

const { t } = useI18n();
const is_launching = ref(false);
const toast = useToast();

async function start_apex() {
  is_launching.value = true;
  await openPath('steam://rungameid/1172470')
  toast.info('apex.startApex')
  await sleep(2000);
  is_launching.value = false;
}
</script>

<template>
  <v-btn @click="start_apex" :loading="is_launching" :title="t('apex.startApex')">
    {{ t('apex.startApex') }}
  </v-btn>
</template>

<style scoped>
</style>