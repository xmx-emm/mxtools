<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { onMounted, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useStateStore } from '@/stores/state.ts';
import { useToast } from 'vue-toastification';
import OpenBackupsExplorerRegistryToast from '@/components/toast/OpenBackupsExplorerRegistryToast.vue';
import { openPath } from '@tauri-apps/plugin-opener';

const { t } = useI18n();
const state = useStateStore();
const toast = useToast();
const isLoading = ref(false);

async function backups() {
  isLoading.value = true;
  state.explorer_registry_is_backups_ok = await invoke('backups_explorer_registry');
  await invoke('explorer_registry_path').then((value) => {
    if (state.explorer_registry_is_backups_ok) {
      toast.success({
        component: OpenBackupsExplorerRegistryToast,
        props: { registry_file: value },
        listeners: {
          async openFolder() {
            const folder: string = await invoke('explorer_folder');
            console.log('open folder', folder);
            await openPath(folder);
          }
        }
      });
    } else {
    }
    isLoading.value = false;
  }).catch((error: Error) => {
    toast.error(t('explorer.backupError') + ' ' + error.message);
    isLoading.value = false;
  });
}

onMounted(async () => {
  await state.updateExplorerBackups();
});
</script>

<template>
  <v-tooltip :text="t('explorer.backupRegistry')">
    <template v-slot:activator="{ props }">
      <v-btn v-bind="props" @click="backups">
        <template v-slot:prepend>
          <v-progress-circular
            :size="18 "
            v-if="isLoading"
            transition="scroll-x-transition"
            color="green"
            indeterminate
          />
          <v-icon v-else-if="state.explorer_registry_is_backups_ok" color="green">mdi-check</v-icon>
          <v-icon v-else color="error">mdi-exclamation</v-icon>
        </template>
        {{ t('explorer.backups') }}
      </v-btn>
    </template>
  </v-tooltip>
</template>

<style scoped>

</style>
