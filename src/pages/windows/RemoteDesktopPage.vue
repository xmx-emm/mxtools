<script setup lang="ts">
import {computed, onMounted} from 'vue';
import {useI18n} from 'vue-i18n';
import RequestAdministratorPrivileges from '@/components/utils/RequestAdministratorPrivileges.vue';
import RdpStatus from '@/components/windows/rdp/RdpStatus.vue';
import RdpAccessAccounts from '@/components/windows/rdp/RdpAccessAccounts.vue';
import RdpConnections from '@/components/windows/rdp/RdpConnections.vue';
import RdpPortCheck from '@/components/windows/rdp/RdpPortCheck.vue';
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
    <div class="rdp-page-shell">
      <div class="rdp-page-toolbar">
        <span class="mx-beta-badge" :title="t('settings.betaFeaturesHint')">{{ t('common.beta') }}</span>
        <v-btn
          class="rdp-page-refresh"
          size="small"
          variant="tonal"
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

      <RequestAdministratorPrivileges :text="t('rdp.requestAdmin')"/>

      <section class="rdp-section" aria-labelledby="rdp-host-heading">
        <header class="rdp-section-heading">
          <span class="rdp-section-icon" aria-hidden="true"><v-icon icon="mdi-monitor-dashboard" size="19" /></span>
          <div>
            <h2 id="rdp-host-heading">{{ t('rdp.hostSection.title') }}</h2>
            <p>{{ t('rdp.hostSection.subtitle') }}</p>
          </div>
        </header>
        <div class="rdp-host-grid">
          <RdpStatus />
          <RdpAccessAccounts />
        </div>
      </section>

      <section class="rdp-section" aria-labelledby="rdp-client-heading">
        <header class="rdp-section-heading">
          <span class="rdp-section-icon" aria-hidden="true"><v-icon icon="mdi-lan-connect" size="19" /></span>
          <div>
            <h2 id="rdp-client-heading">{{ t('rdp.clientSection.title') }}</h2>
            <p>{{ t('rdp.clientSection.subtitle') }}</p>
          </div>
        </header>
        <div class="rdp-client-grid">
          <RdpConnections />
          <RdpPortCheck />
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.remote-desktop-page {
  position: relative;
}

.rdp-page-shell {
  width: min(100%, 1080px);
  margin: 0 auto;
}

.rdp-page-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-height: 32px;
  margin-bottom: 8px;
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

.rdp-section + .rdp-section {
  margin-top: 24px;
}

.rdp-section-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.rdp-section-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--app-radius-sm);
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.09);
}

.rdp-section-heading h2 {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 650;
  line-height: 1.35;
}

.rdp-section-heading p {
  margin: 2px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.7rem;
  line-height: 1.4;
}

.rdp-host-grid,
.rdp-client-grid {
  display: grid;
  align-items: start;
  gap: 12px;
}

.rdp-host-grid {
  grid-template-columns: minmax(250px, 0.72fr) minmax(430px, 1.28fr);
}

.rdp-client-grid {
  grid-template-columns: minmax(430px, 1.35fr) minmax(280px, 0.65fr);
}

.rdp-host-grid :deep(.rdp-card),
.rdp-client-grid :deep(.rdp-card) {
  margin-bottom: 0 !important;
}

@media (max-width: 860px) {
  .rdp-host-grid,
  .rdp-client-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .rdp-section + .rdp-section {
    margin-top: 20px;
  }

  .rdp-page-refresh {
    min-width: var(--app-control-height-action);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rdp-refresh-icon--active {
    animation: none;
  }
}
</style>
