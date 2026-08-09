<script setup lang="ts">
import {routeFullPath} from '../utils/router.ts';
import {useRoute} from 'vue-router';
import {computed, onMounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';
import {getSystemInfo} from '@/ipc/commands.ts';
import {writeText} from '@tauri-apps/plugin-clipboard-manager';
import {useToast} from 'vue-toastification';

type TauriRuntimeWindow = Window & {__TAURI_INTERNALS__?: unknown};
const isTauriRuntime = typeof window !== 'undefined'
  && Boolean((window as TauriRuntimeWindow).__TAURI_INTERNALS__);

const { t } = useI18n();
const toast = useToast();
const route = useRoute();
const systemInfo = ref<[string, string][]>([]);
const isLoading = ref(false);
const loadError = ref(false);

const isWindows = computed(() => routeFullPath(route) === '/tools/windows');
const showData = computed(() => {
  return systemInfo.value.map(([key, value]) => ({
    name: t(`windows.sysInfo.${key}`, key),
    value,
  }));
});
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

async function loadSystemInfo() {
  if (!isTauriRuntime || isLoading.value) return;
  isLoading.value = true;
  loadError.value = false;
  try {
    systemInfo.value = await getSystemInfo();
  } catch {
    systemInfo.value = [];
    loadError.value = true;
    toast.error(t('windows.loadFailed'));
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  void loadSystemInfo();
});
</script>

<template>
  <div v-if="isWindows" class="app-page windows-overview">
    <header class="app-page__header windows-overview__header">
      <div class="app-page__heading">
        <div class="app-page__eyebrow">{{ t('windows.eyebrow') }}</div>
        <h1 class="app-page__title">{{ t('windows.title') }}</h1>
        <p class="app-page__subtitle">{{ t('windows.subtitle') }}</p>
      </div>

      <div class="windows-overview__meta">
        <span class="windows-overview__summary" aria-live="polite">
          <v-icon icon="mdi-laptop" size="18" aria-hidden="true"/>
          <span>
            {{ isLoading
              ? t('windows.loadingSysInfo')
              : t('windows.systemInfoCount', {count: showData.length}) }}
          </span>
        </span>
      </div>
    </header>

    <div class="app-page__scroll">
      <main class="app-page__content windows-overview__content">
        <section class="system-info-section" aria-labelledby="system-info-title">
          <header class="system-info-section__header">
            <div>
              <h2 id="system-info-title" class="app-section__title">
                {{ t('windows.systemInfoTitle') }}
              </h2>
              <p class="app-section__subtitle">{{ t('windows.systemInfoSubtitle') }}</p>
            </div>

            <div class="system-info-section__actions">
              <v-tooltip :text="t('windows.refreshSysInfo')" location="bottom">
                <template #activator="{props}">
                  <v-btn
                    v-bind="props"
                    class="windows-icon-action"
                    icon="mdi-refresh"
                    size="small"
                    variant="text"
                    :loading="isLoading"
                    :disabled="isLoading"
                    :aria-label="t('windows.refreshSysInfo')"
                    @click="loadSystemInfo"
                  />
                </template>
              </v-tooltip>

              <v-tooltip
                v-if="!isLoading && showData.length"
                :text="t('windows.copySysInfo')"
                location="bottom"
              >
                <template #activator="{props}">
                  <v-btn
                    v-bind="props"
                    class="windows-icon-action"
                    icon="mdi-content-copy"
                    size="small"
                    variant="text"
                    :aria-label="t('windows.copySysInfo')"
                    @click="copySysInfo"
                  />
                </template>
              </v-tooltip>
            </div>
          </header>

          <div
            v-if="isLoading"
            class="system-info-list system-info-list--loading"
            :aria-label="t('windows.loadingSysInfo')"
          >
            <div v-for="index in 7" :key="index" class="system-info-row" aria-hidden="true">
              <v-skeleton-loader type="text" class="system-info-row__label-skeleton"/>
              <v-skeleton-loader type="text" class="system-info-row__value-skeleton"/>
            </div>
          </div>

          <div v-else-if="loadError" class="system-info-state" role="alert">
            <span class="system-info-state__icon" aria-hidden="true">
              <v-icon icon="mdi-information-outline" size="22"/>
            </span>
            <strong>{{ t('windows.loadFailed') }}</strong>
            <v-btn
              class="windows-overview__link-action"
              color="primary"
              size="small"
              variant="text"
              prepend-icon="mdi-refresh"
              @click="loadSystemInfo"
            >
              {{ t('common.retry') }}
            </v-btn>
          </div>

          <div v-else-if="!showData.length" class="system-info-state">
            <span class="system-info-state__icon" aria-hidden="true">
              <v-icon icon="mdi-information-outline" size="22"/>
            </span>
            <strong>{{ t('windows.emptySysInfo') }}</strong>
          </div>

          <dl v-else class="system-info-list">
            <div v-for="item in showData" :key="item.name" class="system-info-row">
              <dt>{{ item.name }}</dt>
              <dd>{{ item.value }}</dd>
            </div>
          </dl>
        </section>
      </main>
    </div>
  </div>
  <div v-else class="page-host">
    <div class="page-host__scroll">
      <router-view/>
    </div>
  </div>
</template>

<style scoped>
.windows-overview__header {
  align-items: center;
}

.windows-overview__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.windows-overview__summary {
  display: inline-flex;
  align-items: center;
  min-height: var(--app-control-height-compact);
  gap: 8px;
  padding-left: 12px;
  color: rgba(var(--v-theme-on-surface), 0.64);
  border-left: 1px solid var(--app-border);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.windows-overview__summary .v-icon {
  color: rgb(var(--v-theme-primary));
}

.windows-overview__link-action {
  min-height: var(--app-control-height-compact) !important;
  height: var(--app-control-height-compact) !important;
  border-radius: var(--app-radius-sm) !important;
  letter-spacing: 0;
  text-transform: none;
}

.system-info-section {
  min-width: 0;
}

.system-info-section__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  min-width: 0;
  gap: 16px;
  padding: 0 2px 12px;
}

.system-info-section__actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 4px;
}

.windows-icon-action {
  flex: 0 0 var(--app-control-height-compact);
  width: var(--app-control-height-compact) !important;
  min-width: var(--app-control-height-compact) !important;
  height: var(--app-control-height-compact) !important;
  min-height: var(--app-control-height-compact) !important;
  padding: 0 !important;
  border-radius: var(--app-radius-sm) !important;
}

.system-info-list {
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--app-border);
  border-bottom: 1px solid var(--app-border);
}

.system-info-row {
  display: grid;
  grid-template-columns: minmax(130px, 0.32fr) minmax(0, 1fr);
  align-items: center;
  min-height: 52px;
  gap: 20px;
  padding: 9px 8px;
  transition: background-color var(--app-motion-fast) var(--app-ease-standard);
}

.system-info-row + .system-info-row {
  border-top: 1px solid var(--app-border);
}

.system-info-row:hover {
  background: var(--app-hover);
}

.system-info-row dt,
.system-info-row dd {
  min-width: 0;
  margin: 0;
  letter-spacing: 0;
}

.system-info-row dt {
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.4;
}

.system-info-row dd {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.system-info-list--loading .system-info-row:hover {
  background: transparent;
}

.system-info-row__label-skeleton {
  width: min(100%, 104px);
}

.system-info-row__value-skeleton {
  width: min(100%, 420px);
}

:deep(.system-info-list--loading .v-skeleton-loader__text) {
  height: 9px;
  margin: 0;
}

.system-info-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  min-height: 240px;
  gap: 9px;
  padding: 24px;
  color: rgba(var(--v-theme-on-surface), 0.64);
  border-top: 1px solid var(--app-border);
  border-bottom: 1px solid var(--app-border);
  text-align: center;
}

.system-info-state__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--app-control-height-action);
  height: var(--app-control-height-action);
  color: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  border-radius: var(--app-radius-sm);
  background: rgba(var(--v-theme-primary), 0.08);
}

.system-info-state strong {
  color: rgba(var(--v-theme-on-surface), 0.82);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.45;
}

@container workspace (max-width: 720px) {
  .windows-overview__header {
    align-items: flex-start;
  }

  .windows-overview__meta {
    width: 100%;
  }

  .windows-overview__summary {
    padding-left: 0;
    border-left: 0;
  }
}

@container workspace (max-width: 520px) {
  .system-info-row {
    grid-template-columns: 1fr;
    align-items: start;
    gap: 3px;
    min-height: 0;
    padding-block: 12px;
  }
}
</style>
