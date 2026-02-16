<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { onMounted, Ref, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useStateStore } from '@/stores/state.ts';
import { useToast } from 'vue-toastification';
import BackupsExplorerRegistry from '@/components/backups/BackupsExplorerRegistry.vue';

const { t } = useI18n();
const state = useStateStore();
const toast = useToast();
const items = ref([]);
const loadingList: Ref<string[], string[]> = ref([]);


async function switch_common_folders(key: string, show: boolean) {
  loadingList.value.push(key);
  const cmd = !show ? 'hide_common_folders' : 'show_common_folders';
  invoke(cmd, {key: key}).then((res) => {
    (items.value as any)[key] = res;
    loadingList.value = loadingList.value.filter((f) => f != key);
  }).catch((err) => {
    toast.error(err);
    loadingList.value = loadingList.value.filter((f) => f != key);
  });
}

async function update() {
  items.value = await invoke('get_all_common_folders');
  const sortedByKeys = Object.keys(items.value)
      .sort()
      .reduce((sortedObj, key) => {
        sortedObj[key] = items.value[key as any];
        return sortedObj;
      }, {} as Record<string, boolean>);
  items.value = sortedByKeys as any;
}

onMounted(async () => {
  await update();
});
</script>

<template>
  <v-card variant="flat" class="common-folders-card">
    <v-card-title class="text-subtitle-1 font-weight-medium pb-1">
      {{ t('explorer.commonFolders') }}
    </v-card-title>
    <v-card-subtitle class="text-caption" style="opacity: 0.8;">
      {{ t('explorer.commonFoldersSubtitle') }}
    </v-card-subtitle>
    <v-card-item class="pt-2">
      <div class="chip-wrap d-flex flex-wrap gap-2">
        <v-chip
          v-for="[k, show] in Object.entries(items)"
          :key="k"
          @click="switch_common_folders(k, show)"
          :disabled="!state.is_elevated"
          variant="flat"
          size="default"
          class="chip-item"
        >
          <template v-slot:prepend>
            <v-progress-circular
              v-if="loadingList.includes(k)"
              :size="18"
              transition="scroll-x-transition"
              :color="show ? 'error' : 'success'"
              indeterminate
            />
            <v-icon v-else :icon="show ? 'mdi-eye' : 'mdi-eye-closed'" size="small" :color="show ? 'info' : 'error'" />
          </template>
          {{ t(`explorer.folders.${k}`) || k }}
        </v-chip>
      </div>
    </v-card-item>
    <v-card-subtitle class="error_color text-caption" v-if="!state.explorer_registry_is_backups_ok">
      {{ t('explorer.backupWarning') }}
    </v-card-subtitle>
    <v-card-actions class="pt-0">
      <v-btn variant="tonal" rounded="lg" @click="update">{{ t('common.refresh') }}</v-btn>
      <v-spacer />
      <BackupsExplorerRegistry />
    </v-card-actions>
  </v-card>
</template>

<style scoped>
.common-folders-card {
  border: 1px solid rgba(var(--v-border-color), 0.08);
  border-radius: 12px;
}
.chip-item {
  border-radius: 10px;
}
</style>
