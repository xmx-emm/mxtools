<script setup lang="ts">

import {useToast} from 'vue-toastification';
import OpenBackupsExplorerRegistryToast from '@/components/toast/OpenBackupsExplorerRegistryToast.vue';
import {openPath} from '@tauri-apps/plugin-opener';

const toast = useToast();

function test() {
  toast.success({
    component: OpenBackupsExplorerRegistryToast,
    props: { registry_file: 'fasefasefasef' },
    listeners: {
      openFolder(v: string) {
        console.log('open folder', v);
      }
    }
  });
}

async function test2() {
  const aa = 'D:\\Development\\old\\tauri\\mx-toolbox';
  await openPath(aa);
  console.log('open folder', aa);
}
</script>

<template>
  <div class="glass-card">
    <input type="date" id="start" name="trip-start" value="2023-07-22" min="2023-01-01" max="2023-12-31">
    <v-btn @click="toast.error('errorfasef')">fasef</v-btn>
    <v-btn @click="toast.info('info info info')">fo info</v-btn>
    <v-btn @click="toast.success('success success success')">success</v-btn>
    <v-btn @click="test">success</v-btn>
    <v-btn @click="test2">test</v-btn>
    /
  </div>
</template>

<style scoped>

</style>
