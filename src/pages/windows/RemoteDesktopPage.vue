<script setup lang="ts">
import {computed, onMounted} from 'vue';
import {useI18n} from 'vue-i18n';
import RequestAdministratorPrivileges from '@/components/utils/RequestAdministratorPrivileges.vue';
import RdpStatus from '@/components/windows/rdp/RdpStatus.vue';
import WindowsUserManagement from '@/components/windows/rdp/WindowsUserManagement.vue';
import RdpUserManagement from '@/components/windows/rdp/RdpUserManagement.vue';
import RdpPortCheck from '@/components/windows/rdp/RdpPortCheck.vue';
import RdpQuickConnect from '@/components/windows/rdp/RdpQuickConnect.vue';
import {useRdpStore} from '@/stores/rdp.ts';
import {useWindowsUserStore} from '@/stores/windows_user.ts';

const { t } = useI18n();
const store = useRdpStore();
const userStore = useWindowsUserStore();
const refreshing = computed(() => store.loading || userStore.loading);

async function refreshAll() {
  if (store.loading) return;
  await store.loadAll();
}

onMounted(() => {
  void refreshAll();
});
</script>

<template>
  <div class="page-content remote-desktop-page" :aria-busy="refreshing">
    <v-overlay
      :model-value="!store.initialized"
      contained
      persistent
      class="align-center justify-center"
      scrim="rgba(0,0,0,0.18)"
      role="status"
      :aria-label="t('rdp.loading')"
      aria-live="polite"
    >
      <v-progress-circular indeterminate color="primary" />
    </v-overlay>
    <RequestAdministratorPrivileges :text="t('rdp.requestAdmin')"/>
    <div class="rdp-page-toolbar">
      <span class="mx-beta-badge" :title="t('settings.betaFeaturesHint')">{{ t('common.beta') }}</span>
      <v-btn
        class="rdp-page-refresh"
        size="small"
        variant="tonal"
        rounded="lg"
        :disabled="refreshing"
        :aria-label="t('common.refresh')"
        :title="t('common.refresh')"
        @click="refreshAll"
      >
        <template #prepend>
          <v-icon icon="mdi-refresh" :class="{'rdp-refresh-icon--active': refreshing}" />
        </template>
        {{ t('common.refresh') }}
      </v-btn>
    </div>
    <RdpStatus/>
    <WindowsUserManagement/>
    <RdpUserManagement/>
    <RdpPortCheck/>
    <RdpQuickConnect/>
  </div>
</template>

<style scoped>
.remote-desktop-page {
  position: relative;
}

.rdp-page-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-height: 32px;
  margin-block: 8px;
}

.rdp-page-refresh {
  min-width: 92px;
}

.rdp-refresh-icon--active {
  animation: rdp-refresh-spin 700ms linear infinite;
}

@keyframes rdp-refresh-spin {
  to { transform: rotate(1turn); }
}

@media (prefers-reduced-motion: reduce) {
  .rdp-refresh-icon--active {
    animation: none;
  }
}
</style>
