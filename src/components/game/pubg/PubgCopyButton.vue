<script setup lang="ts">
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {POSITION} from 'vue-toastification/src/ts/constants.ts';
import pubgStore from '@/stores/game/pubg.ts';

const { t } = useI18n();
const pubg_state = pubgStore();
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
    prepend-icon="mdi-apple-keyboard-option"
    @click="copyToClipboard(pubg_state.launch_options)"
    :title="pubg_state.launch_options"
  >{{ t('common.copyLaunchOptions') }}</v-btn>
</template>

<style scoped>
</style>

