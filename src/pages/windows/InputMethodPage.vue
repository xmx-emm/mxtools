<script setup lang="ts">
import {invoke} from '@tauri-apps/api/core';
import {computed, onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';

const { t } = useI18n();

interface InputMethodItem {
  id: string;
  name: string;
  enabled: boolean;
  order: number;
}

const toast = useToast();
const items = ref<InputMethodItem[]>([]);
const loading = ref(false);
const saving = ref(false);

// 后端仅返回已添加的输入法(Preload),此处即当前列表
const listItems = computed(() => items.value);

async function load() {
  loading.value = true;
  try {
    items.value = await invoke<InputMethodItem[]>('get_input_methods');
  } catch (e: unknown) {
    toast.error(String(e));
  } finally {
    loading.value = false;
  }
}

async function setOrder(newOrder: string[]) {
  saving.value = true;
  try {
    await invoke('set_input_method_order', { ids: newOrder });
    await load();
    toast.success(t('inputMethod.toastOrderSaved'));
  } catch (e: unknown) {
    toast.error(String(e));
  } finally {
    saving.value = false;
  }
}

async function setEnabled(id: string, enabled: boolean) {
  saving.value = true;
  try {
    await invoke('set_input_method_enabled', { id, enabled });
    await load();
    toast.success(enabled ? t('inputMethod.toastAdded') : t('inputMethod.toastRemoved'));
  } catch (e: unknown) {
    toast.error(String(e));
  } finally {
    saving.value = false;
  }
}

function moveUp(index: number) {
  if (index <= 0) return;
  const ids = listItems.value.map((x) => x.id);
  [ids[index], ids[index - 1]] = [ids[index - 1], ids[index]];
  setOrder(ids);
}

function moveDown(index: number) {
  const ids = listItems.value.map((x) => x.id);
  if (index >= ids.length - 1) return;
  [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
  setOrder(ids);
}

onMounted(() => {
  load();
});
</script>

<template>
  <div class="page-content d-flex flex-column">
    <h2 class="text-h6 font-weight-medium mb-3" style="letter-spacing: -0.02em;">
      {{ t('inputMethod.title') }}
    </h2>
    <p class="text-body-2 text-medium-emphasis mb-4">
      {{ t('inputMethod.description') }}
    </p>

    <v-card variant="flat" class="input-method-card mb-4">
      <v-card-title class="text-subtitle-1 font-weight-medium pb-1">
        {{ t('inputMethod.cardTitle') }}
      </v-card-title>
      <v-card-subtitle class="text-caption" style="opacity: 0.8;">
        {{ t('inputMethod.cardSubtitle') }}
      </v-card-subtitle>
      <v-card-text>
        <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-3"/>
        <div v-else class="enabled-list">
          <div
            v-for="(item, index) in listItems"
            :key="item.id"
            class="list-row d-flex align-center py-2 px-3 rounded-lg mb-1"
          >
            <span class="order-num text-caption text-medium-emphasis mr-2">{{ index + 1 }}</span>
            <span class="flex-grow-1">{{ item.name }}</span>
            <v-btn
              icon
              size="small"
              variant="text"
              :disabled="index === 0 || saving"
              @click="moveUp(index)"
            >
              <v-icon size="small">mdi-chevron-up</v-icon>
            </v-btn>
            <v-btn
              icon
              size="small"
              variant="text"
              :disabled="index === listItems.length - 1 || saving"
              @click="moveDown(index)"
            >
              <v-icon size="small">mdi-chevron-down</v-icon>
            </v-btn>
            <v-switch
              :model-value="true"
              hide-details
              color="primary"
              :disabled="saving"
              @update:model-value="(v: boolean | null) => setEnabled(item.id, v ?? false)"
            />
          </div>
          <p v-if="!loading && listItems.length === 0" class="text-caption text-medium-emphasis">
            {{ t('inputMethod.empty') }}
          </p>
        </div>
      </v-card-text>
    </v-card>

    <v-btn
      class="mt-4"
      variant="tonal"
      rounded="lg"
      :loading="loading"
      @click="load"
    >
      {{ t('common.refresh') }}
    </v-btn>
  </div>
</template>

<style scoped>
.input-method-card {
  border: 1px solid rgba(var(--v-border-color), 0.08);
  border-radius: 12px;
}

.list-row {
  background: rgba(var(--v-theme-surface), 0.3);
}

.order-num {
  min-width: 1.5rem;
}
</style>
