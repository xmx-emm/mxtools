<script setup lang="ts">
import {openPath} from '@tauri-apps/plugin-opener';
import {sleep} from '@/utils/time.ts';
import {ref} from 'vue';
import {useToast} from 'vue-toastification';

const is_launching = ref(false);
const toast = useToast();

async function start_pubg() {
  is_launching.value = true;
  await openPath('steam://rungameid/578080');
  toast.info('pubg.startPubg');
  await sleep(2000);
  is_launching.value = false;
}
</script>

<template>
  <v-btn @click="start_pubg" :loading="is_launching" title="启动 PUBG">
    启动 PUBG
  </v-btn>
</template>

<style scoped>
</style>

