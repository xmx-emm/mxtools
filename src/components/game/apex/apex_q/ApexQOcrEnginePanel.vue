<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';
import type {ApexQOcrStatus} from '@/ipc/commands.ts';
import type {ApexQOcrEngine} from '@/types/apex_q.ts';

const props = withDefaults(
  defineProps<{
    status: ApexQOcrStatus | null;
    checking?: boolean;
    downloading?: boolean;
    downloadPercent?: number;
    downloadFile?: string;
    downloadMirror?: string;
    engine: ApexQOcrEngine;
    compact?: boolean;
  }>(),
  {
    checking: false,
    downloading: false,
    downloadPercent: 0,
    downloadFile: '',
    downloadMirror: '',
    compact: false,
  },
);

const emit = defineEmits<{
  'update:engine': [value: ApexQOcrEngine];
  download: [];
  recheck: [];
  delete: [];
  'open-win-settings': [];
}>();

const {t} = useI18n();

const alertType = computed(() => {
  if (props.checking) return 'info';
  if (props.engine === 'auto') {
    return props.status?.rapidReady || props.status?.winReady ? 'success' : 'warning';
  }
  if (props.engine === 'rapid') {
    return props.status?.rapidReady ? 'success' : 'warning';
  }
  return props.status?.winReady ? 'success' : 'warning';
});

const statusText = computed(() => {
  if (props.checking) return t('apex.apexQ.ocrChecking');
  if (props.engine === 'auto') {
    if (props.status?.rapidReady && props.status?.winReady) {
      return t('apex.apexQ.ocrAutoBothReady');
    }
    if (props.status?.rapidReady) return t('apex.apexQ.ocrAutoRapidReady');
    if (props.status?.winReady) return t('apex.apexQ.ocrWinFallbackOnly');
    return t('apex.apexQ.ocrUnavailable');
  }
  if (props.engine === 'rapid') {
    if (props.status?.rapidReady) return t('apex.apexQ.ocrRapidReady');
    return t('apex.apexQ.ocrRapidMissing');
  }
  if (props.status?.winReady) return t('apex.apexQ.ocrWinReady');
  return t('apex.apexQ.ocrWinMissing');
});

const engineItems = computed(() => [
  {
    value: 'auto' as const,
    title: t('apex.apexQ.ocrEngineAuto'),
    subtitle: t('apex.apexQ.ocrEngineAutoHint'),
  },
  {
    value: 'rapid' as const,
    title: t('apex.apexQ.ocrEngineRapid'),
    subtitle: t('apex.apexQ.ocrEngineRapidHint'),
  },
  {
    value: 'win' as const,
    title: t('apex.apexQ.ocrEngineWin'),
    subtitle: t('apex.apexQ.ocrEngineWinHint'),
  },
]);
</script>

<template>
  <section class="apex-q-ocr-engine" :class="{'apex-q-ocr-engine--compact': compact}">
    <header class="apex-q-ocr-engine-header">
      <span class="apex-q-ocr-engine-icon" aria-hidden="true">
        <v-icon icon="mdi-text-recognition" size="20" />
      </span>
      <div>
        <h3>{{ t('apex.apexQ.ocrEngineTitle') }}</h3>
        <p>{{ t('apex.apexQ.ocrEngineHint') }}</p>
      </div>
    </header>

    <v-radio-group
      :model-value="engine"
      class="apex-q-ocr-engine-options"
      density="compact"
      hide-details
      @update:model-value="emit('update:engine', $event as ApexQOcrEngine)"
    >
      <v-radio
        v-for="item in engineItems"
        :key="item.value"
        :value="item.value"
        :disabled="downloading"
      >
        <template #label>
          <div class="apex-q-ocr-engine-option">
            <strong>{{ item.title }}</strong>
            <span>{{ item.subtitle }}</span>
          </div>
        </template>
      </v-radio>
    </v-radio-group>

    <div class="apex-q-ocr-status" :class="`apex-q-ocr-status--${alertType}`">
      <v-icon
        :icon="alertType === 'success' ? 'mdi-check-circle' : alertType === 'warning' ? 'mdi-exclamation' : 'mdi-refresh'"
        size="20"
      />
      <div class="apex-q-ocr-status-copy">
        <strong>{{ statusText }}</strong>
        <code v-if="status?.installDir && engine !== 'win'" :title="status.installDir">
          {{ t('apex.apexQ.ocrInstallDir') }}: {{ status.installDir }}
        </code>
        <span v-if="status && !checking">
          {{ t('apex.apexQ.ocrStatusLine', {
            rapid: status.rapidReady ? t('apex.apexQ.ocrStatusOn') : t('apex.apexQ.ocrStatusOff'),
            win: status.winReady ? t('apex.apexQ.ocrStatusOn') : t('apex.apexQ.ocrStatusOff'),
            active: status.activeEngine,
          }) }}
        </span>
      </div>
    </div>

    <div v-if="downloading" class="apex-q-ocr-download">
      <div>
        {{ downloadFile || t('apex.apexQ.ocrDownloading') }}
        <span v-if="downloadMirror"> · {{ downloadMirror }}</span>
      </div>
      <v-progress-linear :model-value="downloadPercent" height="6" rounded color="primary" />
    </div>

    <footer class="apex-q-ocr-engine-actions">
      <v-btn
        v-if="engine !== 'win' && (engine === 'rapid' || !status?.rapidReady)"
        color="primary"
        prepend-icon="mdi-download"
        :size="compact ? 'small' : undefined"
        :loading="downloading"
        :disabled="!!status?.rapidReady"
        @click="emit('download')"
      >
        {{ status?.rapidReady ? t('apex.apexQ.ocrDownloaded') : t('apex.apexQ.ocrDownload') }}
      </v-btn>
      <v-btn
        v-if="engine === 'win' || (engine === 'auto' && !status?.winReady)"
        variant="tonal"
        prepend-icon="mdi-laptop"
        :size="compact ? 'small' : undefined"
        @click="emit('open-win-settings')"
      >
        {{ t('apex.apexQ.openOcrSettings') }}
      </v-btn>
      <v-btn
        variant="text"
        prepend-icon="mdi-refresh"
        :size="compact ? 'small' : undefined"
        :loading="checking"
        :disabled="downloading"
        @click="emit('recheck')"
      >
        {{ t('apex.apexQ.recheckOcr') }}
      </v-btn>
      <v-btn
        v-if="status?.rapidReady"
        variant="text"
        color="warning"
        prepend-icon="mdi-delete"
        :size="compact ? 'small' : undefined"
        :disabled="downloading"
        @click="emit('delete')"
      >
        {{ t('apex.apexQ.ocrDelete') }}
      </v-btn>
    </footer>
  </section>
</template>

<style scoped>
.apex-q-ocr-engine {
  padding: 18px;
  border: 1px solid rgba(var(--v-border-color), 0.11);
  border-radius: 16px;
  background: rgba(var(--v-theme-surface), 0.88);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.apex-q-ocr-engine-header {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  margin-bottom: 15px;
}

.apex-q-ocr-engine-header h3 {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.94);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.35;
}

.apex-q-ocr-engine-header p {
  margin: 3px 0 0;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 12px;
  line-height: 1.55;
}

.apex-q-ocr-engine-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  border-radius: 10px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
}

.apex-q-ocr-engine-options {
  margin: 0 0 12px;
}

.apex-q-ocr-engine-options :deep(.v-selection-control-group) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.apex-q-ocr-engine-option {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  line-height: 1.3;
}

.apex-q-ocr-engine-option strong {
  color: rgba(var(--v-theme-on-surface), 0.92);
  font-size: 12px;
  font-weight: 650;
}

.apex-q-ocr-engine-option span {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 10px;
  line-height: 1.45;
}

.apex-q-ocr-engine :deep(.v-selection-control) {
  grid-area: auto;
  align-items: flex-start;
  min-height: 88px;
  height: 100%;
  padding: 11px 10px;
  border: 1px solid rgba(var(--v-border-color), 0.11);
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.018);
  transition: border-color 0.18s ease, background-color 0.18s ease, transform 0.18s ease;
}

.apex-q-ocr-engine :deep(.v-selection-control:hover) {
  border-color: rgba(var(--v-theme-primary), 0.28);
  background: rgba(var(--v-theme-primary), 0.035);
}

.apex-q-ocr-engine :deep(.v-selection-control--dirty) {
  border-color: rgba(var(--v-theme-primary), 0.5);
  background: rgba(var(--v-theme-primary), 0.085);
}

.apex-q-ocr-engine :deep(.v-selection-control__wrapper) {
  margin-top: -2px;
  margin-inline-end: 3px;
}

.apex-q-ocr-status {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 13px;
  border-radius: 12px;
  color: rgb(var(--v-theme-info));
  background: rgba(var(--v-theme-info), 0.08);
}

.apex-q-ocr-status--success {
  color: rgb(var(--v-theme-success));
  background: rgba(var(--v-theme-success), 0.09);
}

.apex-q-ocr-status--warning {
  color: rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.09);
}

.apex-q-ocr-status-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 3px;
}

.apex-q-ocr-status-copy strong {
  font-size: 12px;
  font-weight: 620;
}

.apex-q-ocr-status-copy span,
.apex-q-ocr-status-copy code {
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-family: inherit;
  font-size: 10px;
  line-height: 1.45;
}

.apex-q-ocr-status-copy code {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.apex-q-ocr-download {
  margin-top: 12px;
  color: rgba(var(--v-theme-on-surface), 0.65);
  font-size: 11px;
}

.apex-q-ocr-download > div {
  margin-bottom: 6px;
}

.apex-q-ocr-engine-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

@media (max-width: 720px) {
  .apex-q-ocr-engine-options :deep(.v-selection-control-group) {
    grid-template-columns: 1fr;
  }

  .apex-q-ocr-engine :deep(.v-selection-control) {
    min-height: 64px;
  }
}
</style>
