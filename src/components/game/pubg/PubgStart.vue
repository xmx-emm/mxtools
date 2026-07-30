<script setup lang="ts">
import {openPath} from '@tauri-apps/plugin-opener';
import {sleep} from '@/utils/time.ts';
import {ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';

const is_launching = ref(false);
const toast = useToast();
const {t} = useI18n();

async function start_pubg() {
  is_launching.value = true;
  try {
    await openPath('steam://rungameid/578080');
    toast.info(t('pubg.startPubg'));
    await sleep(2000);
  } catch (error) {
    toast.error(String(error));
  } finally {
    is_launching.value = false;
  }
}
</script>

<template>
  <v-btn @click="start_pubg" :loading="is_launching" :title="t('pubg.startPubg')">
    {{ t('pubg.startPubg') }}
  </v-btn>
</template>

<style scoped>
</style>
