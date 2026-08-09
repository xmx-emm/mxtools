<script setup lang="ts">
import {computed} from 'vue';
import {useI18n} from 'vue-i18n';
import type {RazerPollingStatus} from '@/types/razer_polling.ts';

const props = defineProps<{
  statuses: RazerPollingStatus[];
  selectedDeviceId: string | null;
  loading: boolean;
  applying: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  selectDevice: [deviceId: string];
  setRate: [deviceId: string, rateHz: number];
  restore: [deviceId: string];
  verify: [deviceId: string];
}>();

const {t} = useI18n();
const connected = computed(() => props.statuses.filter(status => status.available));
const selected = computed(() => connected.value.find(
  status => status.device.deviceId === props.selectedDeviceId,
) ?? connected.value[0] ?? null);
const rateOptions = computed(() => selected.value?.supportedRatesHz.length
  ? selected.value.supportedRatesHz
  : selected.value?.candidateRatesHz ?? []);
const canWrite = computed(() => Boolean(selected.value)
  && !props.loading
  && !props.applying
  && !selected.value?.busy
  && !selected.value?.faulted);
const deviceItems = computed(() => connected.value.map(status => ({
  title: status.device.name,
  value: status.device.deviceId,
})));

function formatRate(rate: number) {
  return rate >= 1000 ? `${rate / 1000}K` : String(rate);
}
</script>

<template>
  <section class="razer-device" :aria-label="t('razerPolling.deviceTitle')" :aria-busy="loading || applying">
    <header class="razer-device__heading">
      <div>
        <h2>{{ t('razerPolling.deviceTitle') }}</h2>
        <span v-if="selected">
          {{ selected.device.name }} - {{ t(`razerPolling.connection.${selected.device.connection}`) }}
        </span>
        <span v-else>{{ t('razerPolling.notFound') }}</span>
      </div>
      <v-tooltip :text="t('razerPolling.refresh')" location="bottom">
        <template #activator="{props: activatorProps}">
          <v-btn
            v-bind="activatorProps"
            class="mx-compact-icon-button"
            icon="mdi-refresh"
            size="small"
            variant="text"
            :loading="loading"
            :disabled="applying"
            :aria-label="t('razerPolling.refresh')"
            @click="emit('refresh')"
          />
        </template>
      </v-tooltip>
    </header>

    <v-select
      v-if="connected.length > 1"
      class="razer-device__selector"
      :model-value="selected?.device.deviceId"
      :items="deviceItems"
      :label="t('razerPolling.selectDevice')"
      density="compact"
      variant="outlined"
      hide-details
      @update:model-value="emit('selectDevice', $event)"
    />

    <template v-if="selected">
      <div class="razer-device__meta">
        <span>{{ t('razerPolling.current') }}</span>
        <strong>{{ selected.currentRateHz ?? '-' }} Hz</strong>
        <span v-if="selected.baselineRateHz !== null">
          {{ t('razerPolling.baseline', {rate: selected.baselineRateHz}) }}
        </span>
      </div>

      <v-btn-toggle
        class="game-page-segmented-toggle razer-device__rates"
        :model-value="selected.currentRateHz"
        color="primary"
        variant="text"
        border
        divided
        density="compact"
        :disabled="!canWrite"
        @update:model-value="$event != null && emit('setRate', selected.device.deviceId, $event)"
      >
        <v-btn v-for="rate in rateOptions" :key="rate" :value="rate" size="small">
          {{ formatRate(rate) }}
        </v-btn>
      </v-btn-toggle>

      <div class="razer-device__actions">
        <span>{{ t('razerPolling.verifiedHint') }}</span>
        <div>
          <v-btn
            size="small"
            variant="text"
            prepend-icon="mdi-shield-check-outline"
            :disabled="!canWrite"
            @click="emit('verify', selected.device.deviceId)"
          >
            {{ t('razerPolling.verifyCapabilities') }}
          </v-btn>
          <v-btn
            size="small"
            variant="text"
            prepend-icon="mdi-restore"
            :disabled="!canWrite || selected.baselineRateHz === null || selected.baselineRateHz === selected.currentRateHz"
            @click="emit('restore', selected.device.deviceId)"
          >
            {{ t('razerPolling.restore') }}
          </v-btn>
        </div>
      </div>

      <v-alert
        v-if="selected.possiblyChanged || selected.faulted || selected.lastError"
        class="razer-device__alert"
        type="warning"
        variant="tonal"
        density="compact"
      >
        {{ selected.lastError || t('razerPolling.faulted') }}
      </v-alert>
    </template>
    <p v-else class="razer-device__empty">{{ t('razerPolling.notFoundHint') }}</p>
  </section>
</template>

<style scoped>
.razer-device { padding: 0 8px 18px; border-bottom: 1px solid var(--app-border); }
.razer-device__heading, .razer-device__actions { display: flex; align-items: center; justify-content: space-between; gap: var(--app-space-3); }
.razer-device__heading h2 { margin: 0; font-size: 12px; font-weight: 680; line-height: 1.4; }
.razer-device__heading span, .razer-device__actions > span, .razer-device__empty { color: rgba(var(--v-theme-on-surface), .55); font-size: 11px; line-height: 1.45; }
.razer-device__selector { max-width: 360px; margin-top: 12px; }
.razer-device__meta { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.razer-device__meta span { color: rgba(var(--v-theme-on-surface), .55); font-size: 11px; }
.razer-device__meta strong { font-size: 16px; font-variant-numeric: tabular-nums; }
.razer-device__rates { display: flex; max-width: 100%; margin-top: 10px; overflow-x: auto; }
.razer-device__rates :deep(.v-btn) { flex: 0 0 auto; min-width: 48px; }
.razer-device__actions { margin-top: 10px; }
.razer-device__actions > div { display: flex; flex: 0 0 auto; gap: 4px; }
.razer-device__actions .v-btn { min-height: var(--app-control-height-compact); height: var(--app-control-height-compact); border-radius: var(--app-radius-sm); letter-spacing: 0; text-transform: none; }
.razer-device__alert { margin-top: 10px; }
.razer-device__empty { margin: 12px 0 0; }
@container workspace (max-width: 620px) {
  .razer-device__actions { align-items: flex-start; flex-direction: column; }
  .razer-device__actions > div { flex-wrap: wrap; }
}
</style>
