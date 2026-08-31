<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import {useI18n} from 'vue-i18n';
import {useApexStore} from '@/stores/game/apex.ts';
import type {ApexConfigHistoryEntry, ApexConfigScope} from '@/types/apex_history.ts';
import {
  apexHistorySourceKey,
  apexScopeForPage,
  filterApexHistory,
  toApexLauncherRef,
} from '@/utils/game/apex_history.ts';

const apexStore = useApexStore();
const {t, locale} = useI18n();
const view = ref<'current' | 'all'>('current');
const confirmEntry = ref<ApexConfigHistoryEntry | null>(null);

const launcher = computed(() => apexStore.active_apex_account
  ? toApexLauncherRef(apexStore.active_apex_account)
  : null);
const currentScope = computed(() => apexScopeForPage(apexStore.page_type));
const entries = computed(() => filterApexHistory(
  apexStore.config_history,
  view.value === 'all' ? 'all' : currentScope.value,
  launcher.value,
));

watch(
  () => apexStore.config_history_dialog,
  open => {
    if (open) {
      view.value = 'current';
      void apexStore.load_config_history();
    } else {
      confirmEntry.value = null;
    }
  },
);

function scopeLabel(scope: ApexConfigScope): string {
  return t(`apex.history.scopes.${scope}`);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

async function restoreSelected() {
  const entry = confirmEntry.value;
  if (!entry) return;
  if (await apexStore.restore_config_history(entry)) {
    confirmEntry.value = null;
  }
}
</script>

<template>
  <v-dialog
    v-model="apexStore.config_history_dialog"
    max-width="680"
    persistent
  >
    <v-card class="history-card" prepend-icon="mdi-history" :title="t('apex.history.title')">
      <v-card-text class="history-body">
        <div class="history-toolbar">
          <v-btn-toggle
            v-model="view"
            mandatory
            divided
            density="compact"
            color="primary"
            variant="text"
            border
            class="game-page-segmented-toggle"
          >
            <v-btn value="current" size="small">{{ t('apex.history.currentPage') }}</v-btn>
            <v-btn value="all" size="small">{{ t('apex.history.all') }}</v-btn>
          </v-btn-toggle>
          <v-spacer/>
          <v-btn
            icon="mdi-refresh"
            size="small"
            variant="text"
            :loading="apexStore.is_config_history_loading"
            :title="t('apex.history.refresh')"
            :aria-label="t('apex.history.refresh')"
            @click="apexStore.load_config_history"
          />
        </div>

        <v-progress-linear
          v-if="apexStore.is_config_history_loading && !apexStore.config_history.length"
          indeterminate
          color="primary"
        />
        <v-list v-else-if="entries.length" class="history-list" lines="two">
          <v-list-item v-for="entry in entries" :key="entry.id" class="history-row">
            <template #title>
              <div class="history-title-row">
                <span class="history-source">{{ t(apexHistorySourceKey(entry.source)) }}</span>
                <v-chip
                  v-for="scope in entry.scopes"
                  :key="scope"
                  size="x-small"
                  variant="tonal"
                  class="history-scope-chip"
                >
                  {{ scopeLabel(scope) }}
                </v-chip>
              </div>
            </template>
            <template #subtitle>
              <div class="history-meta">
                <span>{{ formatDate(entry.createdAt) }}</span>
                <span v-if="entry.launcher"> / {{ entry.launcher.name || entry.launcher.id }}</span>
              </div>
              <div class="history-summary">
                {{ t('apex.history.scopeSummary', {scopes: entry.scopes.map(scopeLabel).join(' / ')}) }}
              </div>
            </template>
            <template #append>
              <v-btn
                size="small"
                variant="text"
                prepend-icon="mdi-backup-restore"
                :disabled="apexStore.is_config_history_restoring"
                @click="confirmEntry = entry"
              >
                {{ t('apex.history.restore') }}
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
        <div v-else class="history-empty text-medium-emphasis">
          <v-icon icon="mdi-history" size="28"/>
          <span>{{ t('apex.history.empty') }}</span>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer/>
          <v-btn class="history-close-action" variant="text" @click="apexStore.close_config_history_dialog()">
          {{ t('common.close') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog :model-value="!!confirmEntry" max-width="440" persistent>
    <v-card class="history-card history-confirm-card" prepend-icon="mdi-backup-restore" :title="t('apex.history.restoreTitle')">
      <v-card-text class="history-confirm-body">
        <p class="history-confirm-text">{{ t('apex.history.restoreConfirm') }}</p>
        <v-alert
          v-if="apexStore.is_launch_options_modified || apexStore.is_video_config_modified || apexStore.is_game_settings_modified"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          {{ t('apex.history.unsavedWarning') }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer/>
        <v-btn
          variant="text"
          :disabled="apexStore.is_config_history_restoring"
          @click="confirmEntry = null"
        >
          {{ t('common.cancel') }}
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="apexStore.is_config_history_restoring"
          @click="restoreSelected"
        >
          {{ t('apex.history.restore') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.history-card :deep(.v-card-title) { font-size: 16px; font-weight: 660; }
.history-body { padding-top: 8px; }
.history-toolbar {
  display: flex;
  align-items: center;
  min-height: var(--app-control-height-compact);
  margin-bottom: 8px;
}
.history-list { max-height: min(480px, 58vh); overflow-y: auto; padding: 0; }
.history-row { border-bottom: 1px solid rgba(var(--v-border-color), 0.1); padding-block: 8px; }
.history-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.history-source { color: rgba(var(--v-theme-primary), 0.9); font-size: 13px; font-weight: 650; }
.history-scope-chip { color: rgba(var(--v-theme-on-surface), 0.66) !important; background: rgba(var(--v-theme-on-surface), 0.08) !important; font-size: 10px; }
.history-meta { color: rgba(var(--v-theme-on-surface), 0.54); font-size: 11px; line-height: 1.45; }
.history-summary { color: rgba(var(--v-theme-on-surface), 0.42); font-size: 10px; line-height: 1.45; }
.history-row :deep(.v-list-item__append) { padding-inline-start: 14px; }
.history-row :deep(.v-btn) { color: rgba(var(--v-theme-primary), 0.86); font-size: 11px; }
.history-confirm-text { margin: 0; color: rgba(var(--v-theme-on-surface), 0.72); font-size: 12px; line-height: 1.6; }
.history-close-action { color: rgba(var(--v-theme-on-surface), 0.62); }
.history-empty { display: flex; min-height: 180px; align-items: center; justify-content: center; flex-direction: column; gap: 8px; }
</style>
