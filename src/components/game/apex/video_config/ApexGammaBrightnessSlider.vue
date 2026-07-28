<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {useApexStore} from '@/stores/game/apex.ts';
import {
  APEX_GAMMA_REFERENCE,
  brightnessToGamma,
  formatGammaConfig,
  formatGammaDisplay,
  gammaToBrightness,
} from '@/utils/apex_gamma.ts';

const props = withDefaults(defineProps<{
  variant?: 'compact' | 'full';
  modelValue?: number;
}>(), {
  variant: 'compact',
});

const emit = defineEmits<{
  'update:modelValue': [value: number];
}>();

const { t } = useI18n();
const apex_store = useApexStore();

const useParentModel = computed(() => props.modelValue !== undefined);

let storeSyncTimer: ReturnType<typeof setTimeout> | null = null;

function syncStore(brightness: number) {
  apex_store.set_video_config_value(
    'setting.gamma',
    formatGammaConfig(brightnessToGamma(brightness)),
  );
}

function scheduleStoreSync(brightness: number) {
  if (storeSyncTimer) clearTimeout(storeSyncTimer);
  storeSyncTimer = setTimeout(() => {
    storeSyncTimer = null;
    syncStore(brightness);
  }, 100);
}

function flushStoreSync(brightness: number) {
  if (storeSyncTimer) {
    clearTimeout(storeSyncTimer);
    storeSyncTimer = null;
  }
  syncStore(brightness);
}

/** 拖动中用本地值驱动 UI，避免每步写入 Pinia 触发整页视频配置列表重渲染 */
const localBrightness = ref<number | null>(null);

const brightness = computed({
  get: () => {
    if (localBrightness.value != null) return localBrightness.value;
    if (useParentModel.value) return props.modelValue!;
    return gammaToBrightness(
      apex_store.get_video_config_number('setting.gamma', APEX_GAMMA_REFERENCE),
    );
  },
  set: (value: number) => {
    localBrightness.value = value;
    if (useParentModel.value) {
      emit('update:modelValue', value);
    }
    scheduleStoreSync(value);
  },
});

const formattedGamma = computed(() =>
  formatGammaDisplay(brightnessToGamma(brightness.value)),
);

function onSliderInput(value: number) {
  brightness.value = value;
}

function onSliderEnd(value: number) {
  localBrightness.value = value;
  flushStoreSync(value);
  localBrightness.value = null;
}

onUnmounted(() => {
  if (storeSyncTimer) clearTimeout(storeSyncTimer);
});
</script>

<template>
  <div
    class="apex-gamma-brightness"
    :class="props.variant === 'full' ? 'apex-gamma-brightness--full' : 'apex-gamma-brightness--compact'"
  >
    <span
      v-if="props.variant === 'full'"
      class="text-caption text-medium-emphasis apex-gamma-brightness-label"
    >
      {{ t('apexVideoTips.gamma.brightnessLabel') }}
    </span>
    <v-slider
      :model-value="brightness"
      class="apex-gamma-brightness-slider"
      :min="0"
      :max="100"
      :step="1"
      hide-details
      density="compact"
      color="primary"
      @update:model-value="onSliderInput"
      @end="onSliderEnd"
    />
    <span class="text-caption apex-gamma-brightness-value">{{ brightness }}</span>
    <template v-if="props.variant === 'full'">
      <span class="text-caption text-medium-emphasis apex-gamma-brightness-label">
        {{ t('apexVideoTips.gamma.gammaLabel') }}
      </span>
      <span class="text-caption apex-gamma-brightness-value">{{ formattedGamma }}</span>
    </template>
  </div>
</template>

<style scoped>
.apex-gamma-brightness {
  display: flex;
  align-items: center;
  gap: 8px;
}

.apex-gamma-brightness--compact {
  min-width: 140px;
  max-width: 220px;
}

.apex-gamma-brightness--full {
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.apex-gamma-brightness--full .apex-gamma-brightness-slider {
  flex: 1 1 auto;
  min-width: 80px;
}

.apex-gamma-brightness--compact .apex-gamma-brightness-slider {
  flex: 1 1 auto;
  min-width: 72px;
}

.apex-gamma-brightness-label {
  flex: 0 0 auto;
  white-space: nowrap;
}

.apex-gamma-brightness-value {
  flex: 0 0 auto;
  min-width: 1.75rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
</style>
