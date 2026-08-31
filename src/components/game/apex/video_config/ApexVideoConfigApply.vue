<script setup lang="ts">
import {computed, ref} from 'vue';
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
const is_applying_video_config = ref(false);

const apply_button_class = computed(() => {
  if (apex_store.is_video_config_loading || !apex_store.is_video_config_modified) return '';
  return 'warning-red-text-edge-animate';
});

async function apply_video_config() {
  if (is_applying_video_config.value) return;
  is_applying_video_config.value = true;
  try {
    await apex_store.apply_apex_video_config();
  } finally {
    is_applying_video_config.value = false;
  }
}

const {
  dialog,
  close_processes,
  is_thoroughly_kill,
  is_apply_running,
  apply_check,
  force_close_launcher,
  cancel,
} = useCloseLauncherThenApply({
  apply: apply_video_config,
  beforeApply: () => {
    if (apex_store.is_video_config_loading) return false;
    if (!apex_store.is_video_config_modified) {
      toast.info('apex.videoConfigNoChanges');
      return false;
    }
    return true;
  },
  resolveCloseProcesses: () => detectRunningProcesses(['apex']),
});
</script>

<template>
  <v-btn
    @click.stop="apply_check"
    :loading="apex_store.is_video_config_saving || is_apply_running"
    :title="t('apex.applyVideoConfig')"
    :class="apply_button_class"
  >
    {{ t('apex.apply') }}
  </v-btn>
  <CloseRunningProcessesDialog
    v-model="dialog"
    :processes="close_processes"
    :loading="is_thoroughly_kill"
    :message="t('apex.closeApexVideoConfigTip')"
    @force-close="force_close_launcher"
    @cancel="cancel"
  />
</template>
