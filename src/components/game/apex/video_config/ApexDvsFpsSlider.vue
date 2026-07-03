<script setup lang="ts">
import { computed, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import apexStore from '@/stores/game/apex.ts';
import {
  configToDvsTarget,
  formatDvsTargetDisplay,
} from '@/utils/apex_dvs.ts';

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
const apex_store = apexStore();

const useParentModel = computed(() => props.modelValue !== undefined);

let storeSyncTimer: ReturnType<typeof setTimeout> | null = null;

function readTargetFromStore(): number {
  return configToDvsTarget(
    apex_store.get_video_config_value('setting.dvs_enable'),
    apex_store.get_video_config_value('setting.dvs_gpuframetime_min'),
  );
}

function syncStore(target: number) {
  apex_store.set_dvs_fps_target(target);
}

function scheduleStoreSync(target: number) {
  if (!useParentModel.value) {
    syncStore(target);
    return;
  }
  if (storeSyncTimer) clearTimeout(storeSyncTimer);
  storeSyncTimer = setTimeout(() => syncStore(target), 100);
}

function flushStoreSync(target: number) {
  if (!useParentModel.value) {
    syncStore(target);
    return;
  }
  if (storeSyncTimer) {
    clearTimeout(storeSyncTimer);
    storeSyncTimer = null;
  }
  syncStore(target);
}

const target = computed({
  get: () => {
    if (useParentModel.value) return props.modelValue!;
    return readTargetFromStore();
  },
  set: (value: number) => {
    if (useParentModel.value) {
      emit('update:modelValue', value);
      scheduleStoreSync(value);
    } else {
      syncStore(value);
    }
  },
});

const displayValue = computed(() =>
  formatDvsTargetDisplay(target.value, t('apexVideoConfig.options.off')),
);

function onSliderInput(value: number) {
  target.value = value;
}

function onSliderEnd(value: number) {
  flushStoreSync(value);
}

onUnmounted(() => {
  if (storeSyncTimer) clearTimeout(storeSyncTimer);
});
</script>

<template>
  <div
    class="apex-dvs-fps"
    :class="props.variant === 'full' ? 'apex-dvs-fps--full' : 'apex-dvs-fps--compact'"
  >
    <span
      v-if="props.variant === 'full'"
      class="text-caption text-medium-emphasis apex-dvs-fps-label"
    >
      {{ t('apexVideoTips.dvs.targetLabel') }}
    </span>
    <v-slider
      :model-value="target"
      class="apex-dvs-fps-slider"
      :min="0"
      :max="100"
      :step="1"
      hide-details
      density="compact"
      color="primary"
      @update:model-value="onSliderInput"
      @end="onSliderEnd"
    />
    <span class="text-caption apex-dvs-fps-value">{{ displayValue }}</span>
  </div>
</template>

<style scoped>
.apex-dvs-fps {
  display: flex;
  align-items: center;
  gap: 8px;
}

.apex-dvs-fps--compact {
  min-width: 140px;
  max-width: 220px;
}

.apex-dvs-fps--full {
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.apex-dvs-fps--full .apex-dvs-fps-slider {
  flex: 1 1 auto;
  min-width: 80px;
}

.apex-dvs-fps--compact .apex-dvs-fps-slider {
  flex: 1 1 auto;
  min-width: 72px;
}

.apex-dvs-fps-label {
  flex: 0 0 auto;
  white-space: nowrap;
}

.apex-dvs-fps-value {
  flex: 0 0 auto;
  min-width: 1.75rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
</style>
