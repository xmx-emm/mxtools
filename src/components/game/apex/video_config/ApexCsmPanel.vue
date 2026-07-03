<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import apexStore from '@/stores/game/apex.ts';
import type { ApexVideoConfigEnumOption, ApexVideoConfigImpl } from '@/types/apex.ts';

const props = defineProps<{
  item: ApexVideoConfigImpl;
}>();

const { t } = useI18n();
const apex_store = apexStore();

function translateText(key?: string) {
  if (!key) return '';
  if (key.startsWith('apexVideoConfig.') || key.startsWith('apexLaunchOptions.')) return t(key);
  return key;
}

function valueEquals(a: string, b: string): boolean {
  if (a === b) return true;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    return Math.abs(na - nb) < 1e-6;
  }
  return false;
}

function matchOptionIndex(options: ApexVideoConfigEnumOption[] | undefined): number {
  if (!options?.length) return -1;
  for (let i = 0; i < options.length; i++) {
    const matched = Object.entries(options[i].values).every(([key, value]) =>
      valueEquals(apex_store.get_video_config_value(key), value),
    );
    if (matched) return i;
  }
  return -1;
}

const csmEnabled = computed(() => apex_store.get_video_config_bool('setting.csm_enabled'));

const coverageModel = computed(() => {
  const idx = matchOptionIndex(props.item.coverageOptions);
  return idx < 0 ? null : idx;
});

const detailModel = computed(() => {
  const idx = apex_store.get_video_config_enum(props.item);
  return idx < 0 ? null : idx;
});

function onCoverageInput(value: number | null) {
  if (!csmEnabled.value || value == null || value < 0) return;
  const option = props.item.coverageOptions?.[value];
  if (!option) return;
  for (const [key, val] of Object.entries(option.values)) {
    apex_store.set_video_config_value(key, val);
  }
}

function onDetailInput(value: number | null) {
  if (!csmEnabled.value || value == null || value < 0) return;
  apex_store.set_video_config_enum(props.item, Number(value));
}
</script>

<template>
  <div class="apex-csm-panel" @click.stop="">
    <div class="apex-csm-row">
      <span class="apex-csm-label">{{ t('apexVideoConfig.csm.enabled') }}</span>
      <div class="apex-csm-control">
        <v-switch
          :model-value="csmEnabled"
          @update:model-value="apex_store.set_video_config_bool('setting.csm_enabled', !!$event)"
          hide-details
          density="compact"
          inset
          color="primary"
          class="apex-parameter-switch"
        />
      </div>
    </div>
    <div class="apex-csm-row" :class="{ 'is-disabled': !csmEnabled }">
      <span class="apex-csm-label">{{ t('apexVideoConfig.csm.coverage') }}</span>
      <div class="apex-csm-control">
        <v-btn-toggle
          :model-value="coverageModel"
          @update:model-value="onCoverageInput($event as number | null)"
          :disabled="!csmEnabled"
          color="primary"
          variant="text"
          class="apex-parameter-toggle"
          style="max-height: 25px"
          border
          divided
        >
          <v-btn
            v-for="(option, idx) in item.coverageOptions"
            :key="option.label"
            size="small"
            :value="idx"
          >
            {{ translateText(option.label) }}
          </v-btn>
        </v-btn-toggle>
      </div>
    </div>
    <div class="apex-csm-row" :class="{ 'is-disabled': !csmEnabled }">
      <span class="apex-csm-label">{{ t('apexVideoConfig.csm.detail') }}</span>
      <div class="apex-csm-control">
        <v-btn-toggle
          :model-value="detailModel"
          @update:model-value="onDetailInput($event as number | null)"
          :disabled="!csmEnabled"
          color="primary"
          variant="text"
          class="apex-parameter-toggle"
          style="max-height: 25px"
          border
          divided
        >
          <v-btn
            v-for="(option, idx) in item.options"
            :key="option.label"
            size="small"
            :value="idx"
            :color="option.outOfPreset ? 'warning' : undefined"
            :prepend-icon="option.outOfPreset ? 'mdi-lock-alert' : undefined"
            :class="{ 'apex-out-of-preset-btn': option.outOfPreset }"
          >
            {{ translateText(option.label) }}
          </v-btn>
        </v-btn-toggle>
      </div>
    </div>
  </div>
</template>

<style scoped>
.apex-csm-panel {
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
}

.apex-csm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 28px;
}

.apex-csm-row + .apex-csm-row {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.apex-csm-row.is-disabled {
  opacity: 0.45;
  pointer-events: none;
}

.apex-csm-label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  white-space: nowrap;
}

.apex-csm-control {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

:deep(.apex-parameter-toggle .v-btn-group) {
  flex-wrap: nowrap;
}

:deep(.apex-parameter-switch.v-switch) {
  --v-input-control-height: 25px;
  flex: 0 0 auto;
}

:deep(.apex-parameter-switch.v-switch .v-selection-control) {
  min-height: 25px;
}

:deep(.apex-parameter-switch.v-switch--inset .v-switch__track) {
  height: 18px;
  min-width: 32px;
  padding: 0 2px;
}

:deep(.apex-parameter-switch.v-switch--inset .v-switch__thumb) {
  height: 14px;
  width: 14px;
  transform: scale(calc(10 / 14));
}

:deep(.apex-parameter-switch.v-switch--inset:not(.v-input--disabled) .v-selection-control:not(.v-selection-control--dirty) .v-switch__thumb) {
  background-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

:deep(.apex-parameter-switch.v-switch--inset .v-selection-control--dirty .v-switch__thumb),
:deep(.apex-parameter-switch.v-switch--inset .v-switch__thumb--filled) {
  transform: none;
}

:deep(.apex-out-of-preset-btn) {
  color: rgb(var(--v-theme-warning)) !important;
}
</style>
