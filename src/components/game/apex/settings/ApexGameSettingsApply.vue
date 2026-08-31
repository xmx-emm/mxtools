<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {useApexStore} from '@/stores/game/apex.ts';
import CloseRunningProcessesDialog from '@/components/game/common/CloseRunningProcessesDialog.vue';
import {
  detectRunningProcesses,
  useCloseLauncherThenApply,
} from '@/composables/useCloseLauncherThenApply.ts';

const {t} = useI18n();
const toast = useToast();
const apex_store = useApexStore();

const buttonClass = computed(() => apex_store.is_game_settings_modified
  ? 'warning-red-text-edge-animate'
  : '');

const {
  dialog,
  close_processes,
  is_thoroughly_kill,
  is_apply_running,
  apply_check,
  force_close_launcher,
  cancel,
} = useCloseLauncherThenApply({
  apply: async () => {
    await apex_store.apply_apex_game_settings();
  },
  beforeApply: () => {
    if (!apex_store.is_game_settings_modified) {
      toast.info('apex.gameSettings.noChanges');
      return false;
    }
    return true;
  },
  resolveCloseProcesses: () => detectRunningProcesses(['apex']),
});
</script>

<template>
  <v-btn
    :loading="apex_store.is_game_settings_saving || is_apply_running"
    :class="buttonClass"
    :title="t('apex.gameSettings.apply')"
    @click="apply_check"
  >
    {{ t('apex.apply') }}
  </v-btn>

  <CloseRunningProcessesDialog
    v-model="dialog"
    :processes="close_processes"
    :loading="is_thoroughly_kill"
    :message="t('apex.gameSettings.closeApexTip')"
    @force-close="force_close_launcher"
    @cancel="cancel"
  />
</template>
