<script setup lang="ts">
import {computed} from 'vue';
import ApexNumberInput from '@/components/game/apex/common/ApexNumberInput.vue';

const props = withDefaults(defineProps<{
  modelValue: number | string
  min: number
  max: number
  step?: number
  ariaLabel?: string
  disabled?: boolean
}>(), {
  step: 1,
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: number): void
}>();

/**
 * 游戏内滑块会写入六位小数(如 SFX 20 存为 `0.198391`)，这类值不落在 `step` 上。
 * 仅用于定位滑块，落到范围外或非数值时退回下界，不改写既有值。
 */
const sliderValue = computed(() => {
  const parsed = Number(props.modelValue);
  if (!Number.isFinite(parsed)) return props.min;
  return Math.min(props.max, Math.max(props.min, parsed));
});
</script>

<template>
  <div class="apex-range-input">
    <v-slider
      :model-value="sliderValue"
      :min="min"
      :max="max"
      :step="step"
      density="compact"
      color="primary"
      hide-details
      :thumb-size="10"
      :track-size="3"
      :ripple="false"
      class="apex-range-slider"
      :aria-label="ariaLabel"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <ApexNumberInput
      :model-value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      :aria-label="ariaLabel"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.apex-range-input {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.apex-range-slider {
  flex: 1 1 auto;
  min-width: 88px;
  max-width: 184px;
}

.apex-range-slider :deep(.v-input__control) {
  min-height: var(--app-control-height-compact);
}

/* Vuetify 的滑块热区固定 42px，不随 thumb-size 缩小；在 28px 紧凑行里会上下
   越界并压住相邻行的点击与右键提示，这里收敛到行高。 */
.apex-range-slider :deep(.v-slider-thumb__surface::after) {
  width: var(--app-control-height-compact);
  height: var(--app-control-height-compact);
}

@media (max-width: 760px) {
  .apex-range-input { width: 100%; }
  .apex-range-slider { max-width: none; }
}
</style>
