<script setup lang="ts">
import {
  addCustomBackgroundFolder,
  listCustomBackgroundFolders,
  removeCustomBackgroundFolder,
  setCustomBackgroundFolderEnabled,
} from '@/ipc/commands.ts';
import {open} from '@tauri-apps/plugin-dialog';
import {onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import type {CustomBackgroundFolder} from '@/types/explorer.ts';

const { t } = useI18n();
const toast = useToast();

const items = ref<CustomBackgroundFolder[]>([]);
const loading = ref(false);
const saving = ref(false);
const togglingId = ref<string | null>(null);
const dialog = ref(false);
const formName = ref('');
const formPath = ref('');

async function load() {
  loading.value = true;
  try {
    items.value = await listCustomBackgroundFolders();
  } catch (e: unknown) {
    toast.error(String(e));
  } finally {
    loading.value = false;
  }
}

async function pickFolder() {
  const selected = await open({
    multiple: false,
    directory: true,
  });
  if (!selected || typeof selected !== 'string') return;
  formPath.value = selected;
  if (!formName.value.trim()) {
    const parts = selected.replace(/[/\\]+$/, '').split(/[/\\]/);
    formName.value = parts[parts.length - 1] || selected;
  }
}

function openAddDialog() {
  formName.value = '';
  formPath.value = '';
  dialog.value = true;
}

async function submitAdd() {
  const name = formName.value.trim();
  const path = formPath.value.trim();
  if (!name || !path) return;
  saving.value = true;
  try {
    await addCustomBackgroundFolder({ name, path });
    toast.success(t('explorer.contextMenu.addSuccess'));
    dialog.value = false;
    await load();
  } catch (e: unknown) {
    toast.error(String(e));
  } finally {
    saving.value = false;
  }
}

async function toggleEnabled(item: CustomBackgroundFolder, enabled: boolean | null) {
  if (enabled === null) return;
  togglingId.value = item.id;
  try {
    await setCustomBackgroundFolderEnabled({ id: item.id, enabled });
    item.enabled = enabled;
  } catch (e: unknown) {
    toast.error(String(e));
    await load();
  } finally {
    togglingId.value = null;
  }
}

async function removeItem(item: CustomBackgroundFolder) {
  togglingId.value = item.id;
  try {
    await removeCustomBackgroundFolder({ id: item.id });
    toast.success(t('explorer.contextMenu.deleteSuccess'));
    await load();
  } catch (e: unknown) {
    toast.error(String(e));
  } finally {
    togglingId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <v-card variant="flat" class="context-menu-card mt-4">
    <v-card-title class="text-subtitle-1 font-weight-medium pb-1">
      {{ t('explorer.contextMenu.customTitle') }}
    </v-card-title>
    <v-card-subtitle class="text-caption" style="opacity: 0.8;">
      {{ t('explorer.contextMenu.customSubtitle') }}
    </v-card-subtitle>
    <v-card-item class="pt-2">
      <v-progress-linear v-if="loading" indeterminate class="mb-2" color="primary"/>
      <div v-if="!loading && items.length === 0" class="text-caption text-medium-emphasis py-2">
        {{ t('explorer.contextMenu.empty') }}
      </div>
      <v-list v-else density="compact" class="bg-transparent pa-0">
        <v-list-item
          v-for="item in items"
          :key="item.id"
          class="px-0"
        >
          <v-list-item-title>{{ item.name }}</v-list-item-title>
          <v-list-item-subtitle class="text-truncate">{{ item.path }}</v-list-item-subtitle>
          <template #append>
            <div class="d-flex align-center gap-2">
              <v-switch
                :model-value="item.enabled"
                density="compact"
                color="primary"
                hide-details
                :disabled="togglingId === item.id"
                @update:model-value="toggleEnabled(item, $event)"
              />
              <v-btn
                icon="mdi-delete-outline"
                variant="text"
                size="small"
                :disabled="togglingId === item.id"
                :aria-label="t('explorer.contextMenu.delete')"
                @click="removeItem(item)"
              />
            </div>
          </template>
        </v-list-item>
      </v-list>
    </v-card-item>
    <v-card-actions class="pt-0">
      <v-btn
        variant="tonal"
        rounded="lg"
        :loading="loading"
        :disabled="loading"
        prepend-icon="mdi-refresh"
        @click="load"
      >
        {{ t('common.refresh') }}
      </v-btn>
      <v-spacer/>
      <v-btn
        color="primary"
        variant="tonal"
        rounded="lg"
        prepend-icon="mdi-plus"
        @click="openAddDialog"
      >
        {{ t('explorer.contextMenu.add') }}
      </v-btn>
    </v-card-actions>
  </v-card>

  <v-dialog v-model="dialog" max-width="480" persistent>
    <v-card rounded="lg">
      <v-card-title class="text-subtitle-1">
        {{ t('explorer.contextMenu.addDialogTitle') }}
      </v-card-title>
      <v-card-text class="d-flex flex-column gap-3">
        <v-text-field
          v-model="formName"
          :label="t('explorer.contextMenu.displayName')"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
        />
        <div class="d-flex gap-2 align-start">
          <v-text-field
            v-model="formPath"
            class="flex-grow-1"
            :label="t('explorer.contextMenu.folderPath')"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
            readonly
          />
          <v-btn
            class="mt-1"
            variant="tonal"
            rounded="lg"
            prepend-icon="mdi-folder-open-outline"
            @click="pickFolder"
          >
            {{ t('explorer.contextMenu.pickFolder') }}
          </v-btn>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer/>
        <v-btn variant="text" @click="dialog = false">{{ t('common.cancel') }}</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          :disabled="!formName.trim() || !formPath.trim() || saving"
          @click="submitAdd"
        >
          {{ t('common.confirm') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.context-menu-card {
  border: 1px solid rgba(var(--v-border-color), 0.08);
  border-radius: 12px;
}
</style>
