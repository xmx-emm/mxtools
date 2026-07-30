<script setup lang="ts">
import {computed, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import LocalSharesTab from '@/components/windows/folderSharing/LocalSharesTab.vue';
import RemoteAccessTab from '@/components/windows/folderSharing/RemoteAccessTab.vue';
import SmbActivityTab from '@/components/windows/folderSharing/SmbActivityTab.vue';
import ShareDiagnosticsTab from '@/components/windows/folderSharing/ShareDiagnosticsTab.vue';

type SharingTab = 'local' | 'remote' | 'activity' | 'diagnostics';

const {t} = useI18n();
const tab = ref<SharingTab>('local');
const components = {
  local: LocalSharesTab,
  remote: RemoteAccessTab,
  activity: SmbActivityTab,
  diagnostics: ShareDiagnosticsTab,
};
const activeComponent = computed(() => components[tab.value]);
</script>

<template>
  <main class="folder-sharing page-content">
    <header class="page-toolbar">
      <div>
        <h1>
          {{ t('folderSharing.title') }}
          <span class="mx-beta-badge" :title="t('settings.betaFeaturesHint')">{{ t('common.beta') }}</span>
        </h1>
        <p>{{ t('folderSharing.subtitle') }}</p>
      </div>
    </header>

    <v-tabs v-model="tab" density="compact" class="sharing-tabs" show-arrows>
      <v-tab value="local" prepend-icon="mdi-folder-outline">{{ t('folderSharing.tabs.local') }}</v-tab>
      <v-tab value="remote" prepend-icon="mdi-lan-connect">{{ t('folderSharing.tabs.remote') }}</v-tab>
      <v-tab value="activity" prepend-icon="mdi-server-network">{{ t('folderSharing.tabs.activity') }}</v-tab>
      <v-tab value="diagnostics" prepend-icon="mdi-lan-check">{{ t('folderSharing.tabs.diagnostics') }}</v-tab>
    </v-tabs>

    <div class="tab-content">
      <KeepAlive>
        <component :is="activeComponent" />
      </KeepAlive>
    </div>
  </main>
</template>

<style scoped>
.folder-sharing { width: 100%; max-width: 1180px; margin: 0 auto; color: rgba(var(--v-theme-on-surface), 0.9); letter-spacing: 0; }
.page-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 10px; }
.page-toolbar h1 { display: flex; align-items: center; gap: 7px; margin: 0; font-size: 1.18rem; font-weight: 660; letter-spacing: 0; }
.page-toolbar p { margin: 3px 0 0; color: rgba(var(--v-theme-on-surface), 0.56); font-size: 0.75rem; }
.sharing-tabs { min-height: 40px; margin-bottom: 12px; border-bottom: 1px solid rgba(var(--v-border-color), 0.13); }
.sharing-tabs :deep(.v-tab) { min-width: 128px; font-size: 0.74rem; }
.tab-content { min-width: 0; padding-bottom: 8px; }
@media (max-width: 620px) {
  .folder-sharing { padding: 8px; }
  .sharing-tabs :deep(.v-tab) { min-width: 112px; }
  .sharing-tabs :deep(.v-btn__prepend) { display: none; }
}
</style>
