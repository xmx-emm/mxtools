<script setup lang="ts">
import {routeFullPath} from '../utils/router.ts';
import {useRoute, useRouter} from 'vue-router';
import {computed, onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {getSystemInfo} from '@/ipc/commands.ts';
import {writeText} from '@tauri-apps/plugin-clipboard-manager';
import {useToast} from 'vue-toastification';
import {useSettingsStore} from '@/stores/settings.ts';

const { t } = useI18n();
const toast = useToast();
const route = useRoute();
const router = useRouter();
const settingsStore = useSettingsStore();
const systemInfo = ref<[string, string][]>([]);
const isLoading = ref(false);

const isWindows = computed(() => routeFullPath(route) === '/tools/windows');
const showData = computed(() => {
  return systemInfo.value.map(([key, value]) => ({
    name: t(`windows.sysInfo.${key}`, key),
    value,
  }));
});
const headers = computed(() => [
  { title: t('common.name'), key: 'name', sortable: false },
  { title: t('common.value'), key: 'value', sortable: false },
] as { title: string; key: string; sortable: boolean }[]);

function copySysInfoText(): string {
  return showData.value.map(({ name, value }) => `${name}: ${value}`).join('\n');
}

async function copySysInfo() {
  try {
    await writeText(copySysInfoText());
    toast.success(t('toast.copiedToClipboard'));
  } catch {
    toast.error(t('toast.copyError'));
  }
}

onMounted(async () => {
  isLoading.value = true;
  try {
    systemInfo.value = await getSystemInfo();
  } catch (e) {
    toast.error(String(e ?? 'Failed to load system info'));
    systemInfo.value = [];
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <div v-if="isWindows" class="page-content">
    <div class="windows-toolbar mb-3">
      <h2 class="text-h6 font-weight-medium">{{ t('windows.title') }}</h2>
      <div class="windows-toolbar__actions">
        <v-btn
          v-if="settingsStore.betaFeaturesEnabled"
          size="small"
          variant="tonal"
          prepend-icon="mdi-speedometer"
          @click="router.push('/game_optimizer')"
        >
          {{ t('windows.gameOptimizer') }}
          <span class="mx-beta-badge ml-2" :title="t('settings.betaFeaturesHint')">{{ t('common.beta') }}</span>
        </v-btn>
        <v-btn
          v-if="!isLoading && showData.length"
          size="small"
          variant="tonal"
          prepend-icon="mdi-content-copy"
          @click="copySysInfo"
        >
          {{ t('windows.copySysInfo') }}
        </v-btn>
      </div>
    </div>
    <v-card variant="flat" class="windows-card">
      <div v-if="isLoading" class="pa-4">
        <v-skeleton-loader
          v-for="index in 8"
          :key="index"
          type="text"
          class="mb-2"
        />
      </div>
      <v-data-table-virtual
        v-else
        :items="showData"
        :headers="headers"
        hide-default-footer
        density="compact"
        class="elevation-0 system-info-table"
      />
    </v-card>
  </div>
  <div v-else class="page-host">
    <div class="page-host__scroll">
      <router-view/>
    </div>
  </div>
</template>

<style scoped>
.windows-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.windows-toolbar h2 {
  letter-spacing: 0;
}

.windows-toolbar__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}

.windows-card {
  border: 1px solid rgba(var(--v-border-color), 0.08);
  border-radius: 12px;
  overflow: hidden;
}

:deep(.system-info-table) {
  font-size: 0.82rem;
}

:deep(.system-info-table thead th) {
  font-size: 0.78rem !important;
  font-weight: 600 !important;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.55) !important;
}

:deep(.system-info-table tbody td:first-child) {
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.8);
}

:deep(.system-info-table tbody td:last-child) {
  color: rgba(var(--v-theme-on-surface), 0.6);
}

:deep(.system-info-table tbody tr:hover) {
  background: rgba(var(--v-theme-on-surface), 0.03) !important;
}
</style>
