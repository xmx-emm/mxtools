<script setup lang="ts">

import {useToast} from "vue-toastification";
import {POSITION} from "vue-toastification/src/ts/constants.ts";
import apexStore from "@/stores/game/apex.ts";

const apex_state = apexStore();
const toast = useToast();

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('toast.copiedToClipboard', {
      timeout: 1500,
      closeButton: false,
      position: POSITION.TOP_RIGHT,
      hideProgressBar: true,
    });
  } catch (err) {
    toast.error('toast.copyError');
  }
}

</script>

<template>
  <v-btn
      icon="mdi-apple-keyboard-option"
      @click="copyToClipboard(apex_state.launch_options)"
      :title="apex_state.launch_options"/>
</template>

<style scoped>

</style>