<script setup lang="ts">
import {listContextMenuItems, setContextMenuItemEnabled} from '@/ipc/commands.ts';
import {computed, onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {useToast} from 'vue-toastification';
import {useStateStore} from '@/stores/state.ts';
import type {ContextMenuItem} from '@/types/explorer.ts';

const { t } = useI18n();
const toast = useToast();
const state = useStateStore();

const items = ref<ContextMenuItem[]>([]);
const loading = ref(false);
const togglingId = ref<string | null>(null);
const search = ref('');
const scopeFilter = ref<string | null>(null);

const SCOPE_KEYS = [
  'file',
  'directory',
  'directory_background',
  'all',
  'folder',
  'drive',
] as const;

const scopeOptions = computed(() =>
  SCOPE_KEYS.map((key) => ({
    title: t(`explorer.contextMenu.scopes.${key}`),
    value: key,
  })),
);

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return items.value.filter((item) => {
    if (scopeFilter.value && item.scope !== scopeFilter.value) return false;
    if (!q) return true;
    return (
      item.display_name.toLowerCase().includes(q)
      || item.key_name.toLowerCase().includes(q)
      || (item.command ?? '').toLowerCase().includes(q)
    );
  });
});

function canToggle(item: ContextMenuItem): boolean {
  return item.hive === 'HKCU' || state.is_elevated;
}

async function load() {
  loading.value = true;
  try {
    items.value = await listContextMenuItems();
  } catch (e: unknown) {
    toast.error(String(e));
  } finally {
    loading.value = false;
  }
}

async function toggleEnabled(item: ContextMenuItem, enabled: boolean | null) {
  if (enabled === null || enabled === item.enabled) return;
  if (!canToggle(item)) {
    toast.info(t('explorer.contextMenu.needAdminHint'));
    return;
  }
  togglingId.value = item.id;
  try {
    const updated = await setContextMenuItemEnabled({
      id: item.id,
      enabled,
    });
    const idx = items.value.findIndex((x) => x.id === item.id);
    if (idx >= 0) {
      items.value[idx] = updated;
    }
  } catch (e: unknown) {
    toast.error(String(e));
    await load();
  } finally {
    togglingId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <v-card variant="flat" class="context-menu-card mt-4">
    <v-card-title class="text-subtitle-1 font-weight-medium pb-1">
      {{ t('explorer.contextMenu.managerTitle') }}
    </v-card-title>
    <v-card-subtitle class="text-caption" style="opacity: 0.8;">
      {{ t('explorer.contextMenu.managerSubtitle') }}
    </v-card-subtitle>
    <v-card-item class="pt-2">
      <div class="d-flex flex-wrap gap-2 mb-3">
        <v-text-field
          v-model="search"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          prepend-inner-icon="mdi-magnify"
          :placeholder="t('explorer.contextMenu.searchPlaceholder')"
          :aria-label="t('explorer.contextMenu.searchPlaceholder')"
          class="mx-search-field search-field"
        />
        <v-select
          v-model="scopeFilter"
          :items="scopeOptions"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          :placeholder="t('explorer.contextMenu.scopeAll')"
          class="scope-field"
        />
        <v-btn
          variant="tonal"
          rounded="lg"
          prepend-icon="mdi-refresh"
          :loading="loading"
          :disabled="loading"
          @click="load"
        >
          {{ t('common.refresh') }}
        </v-btn>
      </div>

      <v-progress-linear v-if="loading" indeterminate class="mb-2" color="primary"/>

      <div v-if="!loading && filtered.length === 0" class="text-caption text-medium-emphasis py-2">
        {{ t('explorer.contextMenu.emptyList') }}
      </div>

      <v-table v-else density="compact" class="context-menu-table">
        <thead>
          <tr>
            <th>{{ t('explorer.contextMenu.colName') }}</th>
            <th>{{ t('explorer.contextMenu.colScope') }}</th>
            <th>{{ t('explorer.contextMenu.colSource') }}</th>
            <th>{{ t('explorer.contextMenu.colKind') }}</th>
            <th class="text-center">{{ t('explorer.contextMenu.colEnabled') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filtered" :key="item.id">
            <td>
              <div class="text-body-2">{{ item.display_name }}</div>
              <div class="text-caption text-medium-emphasis text-truncate key-name">{{ item.key_name }}</div>
            </td>
            <td>
              <v-chip size="x-small" variant="tonal">
                {{ t(`explorer.contextMenu.scopes.${item.scope}`) }}
              </v-chip>
            </td>
            <td>
              <v-chip
                size="x-small"
                variant="tonal"
                :color="item.hive === 'HKLM' ? 'warning' : 'info'"
              >
                {{ item.hive === 'HKLM' ? t('explorer.contextMenu.hiveSystem') : t('explorer.contextMenu.hiveUser') }}
              </v-chip>
            </td>
            <td>
              <span class="text-caption">
                {{ item.kind === 'handler' ? t('explorer.contextMenu.kindHandler') : t('explorer.contextMenu.kindShell') }}
              </span>
            </td>
            <td class="text-center">
              <v-switch
                :model-value="item.enabled"
                density="compact"
                color="primary"
                hide-details
                class="d-inline-flex"
                :disabled="!canToggle(item) || togglingId === item.id"
                @update:model-value="toggleEnabled(item, $event)"
              />
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card-item>
  </v-card>
</template>

<style scoped>
.context-menu-card {
  border: 1px solid rgba(var(--v-border-color), 0.08);
  border-radius: 12px;
}

.search-field {
  flex: 1 1 200px;
  min-width: 180px;
  max-width: 360px;
}

.scope-field {
  flex: 0 1 160px;
  min-width: 140px;
}

.key-name {
  max-width: 280px;
}

.context-menu-table {
  max-height: 420px;
  overflow: auto;
}
</style>
